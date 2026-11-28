"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { StudioShell, useStudio } from "./StudioKit";
import { parseHexBytes, transferBytes } from "@/lib/usb";

declare global {
  interface Navigator {
    usb?: {
      getDevices(): Promise<USBDeviceLike[]>;
      requestDevice(options: { filters: USBDeviceFilterLike[] }): Promise<USBDeviceLike>;
    };
  }
}

interface USBDeviceFilterLike {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USBDeviceLike {
  readonly vendorId: number;
  readonly productId: number;
  readonly deviceClass: number;
  readonly manufacturerName: string | null;
  readonly productName: string | null;
  readonly serialNumber: string | null;
  readonly opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternateSetting: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  controlTransferIn(setup: USBControlTransferLike, length: number): Promise<USBInTransferResultLike>;
  controlTransferOut(setup: USBControlTransferLike, data: BufferSource): Promise<USBOutTransferResultLike>;
  transferIn(endpointNumber: number, length: number): Promise<USBInTransferResultLike>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutTransferResultLike>;
  readonly configurations: USBConfigurationLike[];
  readonly configuration: USBConfigurationLike | null;
}

interface USBConfigurationLike {
  readonly configurationValue: number;
  readonly interfaces: USBInterfaceLike[];
}

interface USBInterfaceLike {
  readonly interfaceNumber: number;
  readonly claimed: boolean;
  readonly alternates: USBAlternateInterfaceLike[];
}

interface USBAlternateInterfaceLike {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly endpoints: USBEndpointLike[];
}

interface USBEndpointLike {
  readonly endpointNumber: number;
  readonly type: "bulk" | "interrupt" | "isochronous";
  readonly direction: "in" | "out";
  readonly packetSize: number;
}

interface USBControlTransferLike {
  requestType: "standard" | "class" | "vendor";
  recipient: "device" | "interface" | "endpoint" | "other";
  request: number;
  value: number;
  index: number;
}

interface USBInTransferResultLike {
  readonly data: DataView | null;
  readonly status: "ok" | "stall";
}

interface USBOutTransferResultLike {
  readonly bytesWritten: number;
  readonly status: "ok" | "stall";
}

const HEX_CHARS = "0123456789ABCDEF";
const subscribeSupport = () => () => {};
const usbSupported = () => !!navigator.usb;

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_CHARS[(bytes[i] >> 4) & 0xF];
    out += HEX_CHARS[bytes[i] & 0xF];
    if ((i + 1) % 16 === 0) out += "\n";
    else if ((i + 1) % 2 === 0) out += " ";
  }
  return out;
}

function toAscii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : ".";
  }
  return out;
}

export default function UsbDebugWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "usb-debug");
  const supported = useSyncExternalStore(subscribeSupport, usbSupported, () => false);
  const [device, setDevice] = useState<USBDeviceLike | null>(null);
  const [interfaces, setInterfaces] = useState<{ number: number; alternate: number; endpoints: USBEndpointLike[] }[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<number | null>(null);
  const [selectedAlternate, setSelectedAlternate] = useState<number | null>(null);
  const [inEndpoint, setInEndpoint] = useState<number | null>(null);
  const [outEndpoint, setOutEndpoint] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>(() => app.state.output ? app.state.output.split("\n").slice(-200) : []);
  const [inputHex, setInputHex] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  const deviceRef = useRef<USBDeviceLike | null>(null);
  const readingRef = useRef(false);
  const logRef = useRef<string[]>(log);
  const sessionRef = useRef(0);
  const transferPending = useRef(false);

  useEffect(() => () => { readingRef.current = false; sessionRef.current++; const dev = deviceRef.current; deviceRef.current = null; if (dev?.opened) void dev.close().catch(() => {}); }, []);

  useEffect(() => {
    deviceRef.current = device;
  }, [device]);

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const addLog = useCallback((text: string) => {
    const now = new Date().toLocaleTimeString();
    logRef.current = [...logRef.current, `[${now}] ${text}`].slice(-200);
    setLog(logRef.current);
  }, []);

  const clearLog = useCallback(() => {
    logRef.current = [];
    setLog([]);
  }, []);

  const connect = useCallback(async () => {
    if (!navigator?.usb) return;
    setError("");
    try {
      const dev = await navigator.usb.requestDevice({
        filters: [],
      });
      await dev.open();
      if (!dev.configuration) {
        const configuration = dev.configurations[0];
        if (!configuration) { await dev.close(); throw new Error("Device has no USB configurations"); }
        try { await dev.selectConfiguration(configuration.configurationValue); } catch (reason) { await dev.close(); throw reason; }
      }
      setDevice(dev);
      deviceRef.current = dev;
      addLog(`Connected: ${dev.productName ?? "Unknown"} (${dev.vendorId.toString(16).toUpperCase().padStart(4, "0")}:${dev.productId.toString(16).toUpperCase().padStart(4, "0")})`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to connect");
    }
  }, [addLog]);

  const disconnect = useCallback(async () => {
    readingRef.current = false;
    sessionRef.current++;
    setReading(false);
    if (deviceRef.current) {
      try {
        if (selectedInterface !== null) {
          try { await deviceRef.current.releaseInterface(selectedInterface); } catch {}
        }
        await deviceRef.current.close();
      } catch {}
      deviceRef.current = null;
    }
    setDevice(null);
    setInterfaces([]);
    setSelectedInterface(null);
    setSelectedAlternate(null);
    setInEndpoint(null);
    setOutEndpoint(null);
    addLog("Disconnected");
  }, [selectedInterface, addLog]);

  const explore = useCallback(async () => {
    if (!deviceRef.current) return;
    setError("");
    try {
      const dev = deviceRef.current;
      const configs = dev.configuration ? [dev.configuration] : [];
      const ifaces: { number: number; alternate: number; endpoints: USBEndpointLike[] }[] = [];
      for (const cfg of configs) {
        for (const iface of cfg.interfaces) {
          for (const alt of iface.alternates) {
            const eps = alt.endpoints.filter((e) => e.type !== "isochronous");
            ifaces.push({ number: iface.interfaceNumber, alternate: alt.alternateSetting, endpoints: eps });
          }
        }
      }
      setInterfaces(ifaces);
      addLog(`Found ${ifaces.length} interface(s)`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Exploration failed");
    }
  }, [addLog]);

  const selectInterface = useCallback(async (index: number) => {
    if (!deviceRef.current) return;
    setError("");
    const iface = interfaces[index];
    if (!iface) return;
    setInEndpoint(null);
    setOutEndpoint(null);
    try {
      if (selectedInterface !== null && selectedInterface !== iface.number) await deviceRef.current.releaseInterface(selectedInterface);
      await deviceRef.current.claimInterface(iface.number);
      await deviceRef.current.selectAlternateInterface(iface.number, iface.alternate);
      setSelectedInterface(iface.number);
      setSelectedAlternate(iface.alternate);
      const eps = iface?.endpoints ?? [];
      const inEps = eps.filter((e) => e.direction === "in");
      const outEps = eps.filter((e) => e.direction === "out");
      if (inEps.length) setInEndpoint(inEps[0].endpointNumber);
      if (outEps.length) setOutEndpoint(outEps[0].endpointNumber);
      addLog(`Claimed interface ${iface.number}, alternate ${iface.alternate}: ${inEps.length} IN, ${outEps.length} OUT endpoint(s)`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Failed to claim interface");
    }
  }, [interfaces, addLog, selectedInterface]);

  const readOnce = useCallback(async () => {
    if (!deviceRef.current || inEndpoint === null || transferPending.current) return;
    transferPending.current = true;
    const dev = deviceRef.current, session = sessionRef.current;
    setError("");
    try {
      const result = await dev.transferIn(inEndpoint, 64);
      if (deviceRef.current !== dev || sessionRef.current !== session) return;
      if (result.status === "ok" && result.data) {
        const bytes = transferBytes(result.data);
        addLog(`IN ${bytes.length} bytes: ${toHex(bytes)} | ${toAscii(bytes)}`);
      } else {
        addLog(`IN stalled`);
      }
    } catch (reason) {
      if (sessionRef.current === session) setError(reason instanceof Error ? reason.message : "Read failed");
    } finally { transferPending.current = false; }
  }, [deviceRef, inEndpoint, addLog]);

  const writeOnce = useCallback(async () => {
    if (!deviceRef.current || outEndpoint === null) return;
    setError("");
    const hex = inputHex.trim().replace(/\s/g, "");
    if (!hex) return;
    try {
      const bytes = parseHexBytes(hex);
      const result = await deviceRef.current.transferOut(outEndpoint, bytes);
      if (result.status === "ok") {
        addLog(`OUT ${result.bytesWritten} bytes: ${toHex(bytes)} | ${toAscii(bytes)}`);
        setInputHex("");
      } else {
        addLog("OUT stalled");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Write failed");
    }
  }, [deviceRef, outEndpoint, inputHex, addLog]);

  const startReading = useCallback(() => {
    if (!deviceRef.current || inEndpoint === null || readingRef.current || transferPending.current) return;
    const dev = deviceRef.current, session = ++sessionRef.current;
    readingRef.current = true;
    setReading(true);
    const loop = async () => {
      while (readingRef.current && deviceRef.current === dev && sessionRef.current === session) {
        try {
          transferPending.current = true;
          const result = await dev.transferIn(inEndpoint, 64);
          if (sessionRef.current !== session) break;
          if (result.status === "ok" && result.data) {
            const bytes = transferBytes(result.data);
            addLog(`IN ${bytes.length} bytes: ${toHex(bytes)} | ${toAscii(bytes)}`);
          } else if (result.status !== "ok") { addLog("IN stalled"); break; }
          await new Promise((resolve) => setTimeout(resolve, 20));
        } catch (reason) {
          if (sessionRef.current === session) setError(reason instanceof Error ? reason.message : "Read failed");
          break;
        } finally { transferPending.current = false; }
      }
      if (sessionRef.current === session) { readingRef.current = false; setReading(false); }
    };
    void loop();
  }, [deviceRef, inEndpoint, addLog]);

  // Publish output to downstream workspaces (text consumers)
  useEffect(() => {
    const latest = log.join("\n");
    if (app.state.output !== latest) {
      app.patch({ output: latest });
    }
  }, [log, app]);

  return <StudioShell kind="usb-debug" status={`${app.status} · ${device ? "connected" : "disconnected"}`} error={error || app.error}>
    <div className="tool-toolbar">
      {!supported && <span style={{ color: "#ed829d", fontSize: 11 }}>Web USB not supported</span>}
      {supported && !device && <button disabled={reading} onClick={connect}>Connect USB Device</button>}
      {supported && device && <button onClick={disconnect}>Disconnect</button>}
      {device && <button disabled={reading} onClick={explore}>Explore Interfaces</button>}
    </div>

    {!supported && (
      <small className="tool-hint">Web USB requires Chrome or Edge on desktop/Android, served over HTTPS or localhost. Firefox and Safari do not support it.</small>
    )}

    {device && (
      <>
        <div className="tool-toolbar" style={{ marginTop: 8, gap: 10 }}>
          <span style={{ fontSize: 11, color: "#bac9ae" }}>
            {device.vendorId.toString(16).toUpperCase().padStart(4, "0")}:{device.productId.toString(16).toUpperCase().padStart(4, "0")}
            {device.manufacturerName ? ` · ${device.manufacturerName}` : ""}
            {device.productName ? ` · ${device.productName}` : ""}
            {device.serialNumber ? ` · SN: ${device.serialNumber}` : ""}
          </span>
        </div>

        <div className="tool-toolbar" style={{ marginTop: 6, gap: 8 }}>
          <select
            aria-label="Interface"
            defaultValue=""
            onChange={(event) => { if (event.target.value !== "") void selectInterface(Number(event.target.value)); }}
            disabled={!device || reading}
          >
            <option value="">Select interface…</option>
            {interfaces.map((iface, index) => (
              <option key={`${iface.number}-${iface.alternate}`} value={index}>
                Interface {iface.number} / alt {iface.alternate} · {iface.endpoints.filter((e) => e.direction === "in").length}IN/{iface.endpoints.filter((e) => e.direction === "out").length}OUT
              </option>
            ))}
          </select>
          {inEndpoint !== null && <span style={{ fontSize: 11, color: "#bac9ae" }}>IN endpoint {inEndpoint}</span>}
          {outEndpoint !== null && <span style={{ fontSize: 11, color: "#bac9ae" }}>OUT endpoint {outEndpoint}</span>}
          <label>IN <select aria-label="IN endpoint" value={inEndpoint ?? ""} disabled={reading} onChange={(e) => setInEndpoint(e.target.value ? Number(e.target.value) : null)}><option value="">None</option>{[...new Set(interfaces.filter((i) => i.number === selectedInterface && i.alternate === selectedAlternate).flatMap((i) => i.endpoints.filter((e) => e.direction === "in").map((e) => e.endpointNumber)))].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>OUT <select aria-label="OUT endpoint" value={outEndpoint ?? ""} disabled={reading} onChange={(e) => setOutEndpoint(e.target.value ? Number(e.target.value) : null)}><option value="">None</option>{[...new Set(interfaces.filter((i) => i.number === selectedInterface && i.alternate === selectedAlternate).flatMap((i) => i.endpoints.filter((e) => e.direction === "out").map((e) => e.endpointNumber)))].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>

        <div className="tool-toolbar" style={{ marginTop: 6, gap: 8 }}>
          <button disabled={!device || inEndpoint === null || reading} onClick={readOnce}>Read Once</button>
          <button disabled={!device || inEndpoint === null} onClick={() => { if (reading) { readingRef.current = false; sessionRef.current++; setReading(false); } else startReading(); }}>{reading ? "Stop Read" : "Start Read"}</button>
          <input
            aria-label="Hex data to send"
            placeholder="hex bytes (e.g. DE AD BE EF)"
            value={inputHex}
            onChange={(event) => setInputHex(event.target.value)}
            style={{ width: 140, fontSize: 11, fontFamily: "monospace" }}
          />
          <button disabled={!device || outEndpoint === null || !inputHex.trim()} onClick={writeOnce}>Send</button>
        </div>

        <div className="tool-toolbar" style={{ marginTop: 6, gap: 6 }}>
          <button disabled={log.length === 0} onClick={clearLog}>Clear Log</button>
        </div>

        <div className="usb-log" aria-label="USB traffic log">
          {log.map((line, i) => (
            <div key={i} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, padding: 2, borderBottom: "1px solid #ffffff0b" }}>
              {line}
            </div>
          ))}
          {log.length === 0 && <span style={{ fontSize: 11, color: "#6e7a8d", fontStyle: "italic" }}>No traffic yet. Connect, explore, then read or send.</span>}
        </div>

        <small className="tool-hint">Stop Read stops queued reads; an in-flight USB transfer may finish when data arrives. Disconnect closes the device. The traffic log is published as text. On Windows, claiming an interface may require a WinUSB driver.</small>
      </>
    )}
  </StudioShell>;
}

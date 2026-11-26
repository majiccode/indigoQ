export async function extractRegex(input: string, pattern: string, flags: string): Promise<string> {
  const source = `onmessage=e=>{try{const {input,pattern,flags}=e.data;const regex=new RegExp(pattern,flags.includes('g')?flags:flags+'g');postMessage({output:JSON.stringify([...input.matchAll(regex)].slice(0,10000).map(m=>({match:m[0],groups:m.slice(1)})),null,2)})}catch(e){postMessage({error:e.message})}}`;
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  const worker = new Worker(url);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Regex exceeded the 2 second execution limit")); }, 2000);
    worker.onmessage = (event) => { cleanup(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.output); };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message)); };
    worker.postMessage({ input, pattern, flags });
  });
}

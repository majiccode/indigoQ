"""Local Ollama proxy. The browser never needs direct access to the model server."""

from __future__ import annotations

import json
import os

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .models import GenerateRequest

router = APIRouter(prefix="/api/ollama")


def base_url() -> str:
    return os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")


@router.get("/models")
async def list_models() -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{base_url()}/api/tags")
            response.raise_for_status()
            return {"models": response.json().get("models", [])}
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(502, "Cannot reach Ollama. Start Ollama and refresh models.") from error


@router.post("/generate")
async def generate(body: GenerateRequest, request: Request) -> StreamingResponse:
    client = httpx.AsyncClient(timeout=httpx.Timeout(600, connect=10))
    payload = {
        "model": body.model,
        "prompt": body.prompt,
        "system": body.system,
        "stream": True,
        "options": {"temperature": body.temperature},
    }
    if body.jsonOutput:
        payload["format"] = "json"
    try:
        upstream = await client.send(
            client.build_request("POST", f"{base_url()}/api/generate", json=payload),
            stream=True,
        )
        upstream.raise_for_status()
    except httpx.HTTPError as error:
        if "upstream" in locals():
            await upstream.aclose()
        await client.aclose()
        raise HTTPException(
            502, "Ollama could not start generation. Check the selected model."
        ) from error

    async def stream():
        try:
            async for line in upstream.aiter_lines():
                if await request.is_disconnected():
                    break
                if line:
                    yield line + "\n"
        except httpx.HTTPError:
            yield json.dumps({"error": "Connection to Ollama was interrupted"}) + "\n"
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"}
    )

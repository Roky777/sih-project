"""Groq hosted inference; application tools continue to execute on our backend."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from fleet_maintenance.services.assistant.copilot import AssistantUnavailable, OllamaClient


class GroqClient(OllamaClient):
    def __init__(self, key: str, model: str, timeout: float) -> None:
        super().__init__("https://api.groq.com/openai/v1", model, timeout)
        self.key = key

    def available(self) -> tuple[bool, str]:
        if not self.key:
            return False, "The hosted model API key is not configured on the server."
        request = self._request_for("/models", None)
        try:
            with urllib.request.urlopen(request, timeout=4) as response:  # noqa: S310
                models = json.load(response)["data"]
            if not any(m["id"] == self.model for m in models):
                return False, "The configured hosted model is not available."
        except (OSError, ValueError, KeyError, TypeError):
            return False, "Could not verify the hosted model service or API key."
        return True, "ready"

    def _request_for(self, path: str, body: Any) -> urllib.request.Request:
        return urllib.request.Request(
            self.base_url + path,
            data=json.dumps(body).encode() if body else None,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.key}"},
        )

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        timeout: float,
        on_delta: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        if not self.key:
            raise AssistantUnavailable("The hosted model API key is not configured.")
        # Normalize the Ollama tool transcript to hosted tool-call IDs and JSON arguments.
        transcript: list[dict[str, Any]] = []
        pending: list[tuple[str, str]] = []
        for index, message in enumerate(messages):
            m = dict(message)
            if m.get("tool_calls"):
                calls = []
                for i, call in enumerate(m["tool_calls"]):
                    fn = call["function"]
                    call_id = f"call_{index}_{i}"
                    pending.append((fn["name"], call_id))
                    calls.append(
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": fn["name"],
                                "arguments": json.dumps(fn["arguments"]),
                            },
                        }
                    )
                m["tool_calls"] = calls
            if m["role"] == "tool":
                name = m.pop("tool_name")
                match = next((p for p in pending if p[0] == name), None)
                if match is None:
                    continue
                pending.remove(match)
                m["tool_call_id"] = match[1]
            transcript.append(m)
        body: dict[str, Any] = {
            "model": self.model,
            "messages": transcript,
            "stream": on_delta is not None,
            "max_completion_tokens": 1024,
            "temperature": 0.2,
        }
        if self.model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"
        if tools:
            body["tools"] = tools
            body["parallel_tool_calls"] = False
        try:
            with urllib.request.urlopen(
                self._request_for("/chat/completions", body), timeout=timeout
            ) as response:  # noqa: S310
                if not on_delta:
                    return dict(json.load(response)["choices"][0]["message"])
                content = ""
                stream_calls: dict[int, dict[str, str]] = {}
                done = False
                for line in response:
                    if not line.startswith(b"data: "):
                        continue
                    value = line[6:].strip()
                    if value == b"[DONE]":
                        done = True
                        break
                    chunk = json.loads(value)
                    choices = chunk.get("choices", [])
                    if not choices:
                        continue
                    delta = choices[0].get("delta", {})
                    text = delta.get("content") or ""
                    content += text
                    if text:
                        on_delta(text)
                    for call in delta.get("tool_calls", []):
                        fn = stream_calls.setdefault(call["index"], {"name": "", "arguments": ""})
                        for key in ("name", "arguments"):
                            fn[key] += call.get("function", {}).get(key, "")
                if not done:
                    raise AssistantUnavailable("The hosted model stream ended early.")
                return {
                    "content": content,
                    "tool_calls": [{"function": fn} for _, fn in sorted(stream_calls.items())],
                }
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                raise AssistantUnavailable(
                    "The free model quota is busy. Please retry later."
                ) from exc
            raise AssistantUnavailable(f"Hosted inference failed ({exc.code}).") from exc
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise AssistantUnavailable("The hosted model did not complete this answer.") from exc

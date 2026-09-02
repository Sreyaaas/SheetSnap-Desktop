"""
SheetSnap AI Usage & Telemetry Tracker.

Maintains persistent local metrics for Google Gemini API calls, token counts,
cost estimation, and rate limits / daily quota tracking.
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
USAGE_FILE = DATA_DIR / "ai_usage.json"

# Gemini 2.5 / 3.6 Flash Quota Standards (Free Tier Baseline)
DEFAULT_DAILY_LIMIT = 1500     # Requests Per Day (RPD)
DEFAULT_MINUTE_LIMIT = 15      # Requests Per Minute (RPM)

# Estimated Cost per 1M tokens (Flash tier rates: ~$0.075 prompt, ~$0.30 output)
COST_PER_MILLION_PROMPT = 0.075
COST_PER_MILLION_OUTPUT = 0.30


class AITracker:
    """Thread-safe persistent telemetry tracker for Gemini API usage."""

    _lock = threading.Lock()

    @classmethod
    def _ensure_storage(cls) -> Dict[str, Any]:
        """Ensure data directory and JSON file exist and return parsed structure."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if not USAGE_FILE.exists():
            initial_data: Dict[str, Any] = {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "prompt_tokens": 0,
                "candidate_tokens": 0,
                "total_tokens": 0,
                "daily_usage": {},
                "invocations": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_reset": None,
            }
            try:
                with open(USAGE_FILE, "w", encoding="utf-8") as f:
                    json.dump(initial_data, f, indent=2)
            except Exception as e:
                logger.error("Failed to initialize usage file: %s", e)
            return initial_data

        try:
            with open(USAGE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Error reading usage file, creating fresh state: %s", e)
            return {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "prompt_tokens": 0,
                "candidate_tokens": 0,
                "total_tokens": 0,
                "daily_usage": {},
                "invocations": [],
            }

    @classmethod
    def _save_data(cls, data: Dict[str, Any]) -> None:
        """Persist data dictionary safely to disk."""
        try:
            temp_file = USAGE_FILE.with_suffix(".tmp")
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            temp_file.replace(USAGE_FILE)
        except Exception as e:
            logger.error("Failed to save AI usage data: %s", e)

    @classmethod
    def record_invocation(
        cls,
        model: str,
        status: str,  # "success" | "error"
        prompt_tokens: int = 0,
        candidate_tokens: int = 0,
        total_tokens: int = 0,
        latency_sec: float = 0.0,
        tables_extracted: int = 0,
        error_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Record an API invocation with token metrics and response status."""
        with cls._lock:
            data = cls._ensure_storage()

            now = datetime.now(timezone.utc)
            now_iso = now.isoformat()
            today_key = now.strftime("%Y-%m-%d")

            data["total_requests"] = data.get("total_requests", 0) + 1
            if status == "success":
                data["successful_requests"] = data.get("successful_requests", 0) + 1
            else:
                data["failed_requests"] = data.get("failed_requests", 0) + 1

            data["prompt_tokens"] = data.get("prompt_tokens", 0) + prompt_tokens
            data["candidate_tokens"] = data.get("candidate_tokens", 0) + candidate_tokens
            data["total_tokens"] = data.get("total_tokens", 0) + total_tokens

            # Update daily usage
            daily = data.setdefault("daily_usage", {})
            today_stat = daily.setdefault(today_key, {"requests": 0, "tokens": 0})
            today_stat["requests"] += 1
            today_stat["tokens"] += total_tokens

            # Append to recent invocations (keep last 100)
            invocation_record = {
                "id": f"call_{int(time.time() * 1000)}",
                "timestamp": now_iso,
                "model": model,
                "status": status,
                "prompt_tokens": prompt_tokens,
                "candidate_tokens": candidate_tokens,
                "total_tokens": total_tokens,
                "latency_sec": round(latency_sec, 2),
                "tables_extracted": tables_extracted,
                "error_message": error_message,
            }

            invocations = data.setdefault("invocations", [])
            invocations.append(invocation_record)
            if len(invocations) > 100:
                data["invocations"] = invocations[-100:]

            cls._save_data(data)
            return invocation_record

    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """Retrieve aggregated metrics, quotas, and recent invocation log."""
        with cls._lock:
            data = cls._ensure_storage()

            now = datetime.now(timezone.utc)
            today_key = now.strftime("%Y-%m-%d")

            total_reqs = data.get("total_requests", 0)
            success_reqs = data.get("successful_requests", 0)
            failed_reqs = data.get("failed_requests", 0)

            p_tokens = data.get("prompt_tokens", 0)
            c_tokens = data.get("candidate_tokens", 0)
            t_tokens = data.get("total_tokens", 0)

            # Daily usage
            daily = data.get("daily_usage", {})
            today_usage = daily.get(today_key, {"requests": 0, "tokens": 0})
            today_requests = today_usage.get("requests", 0)
            today_tokens = today_usage.get("tokens", 0)

            # Minute rolling window calculation
            now_ts = now.timestamp()
            invocations = data.get("invocations", [])
            recent_minute_count = 0
            for inv in reversed(invocations):
                try:
                    inv_time = datetime.fromisoformat(inv["timestamp"]).timestamp()
                    if now_ts - inv_time <= 60.0:
                        recent_minute_count += 1
                    else:
                        break
                except Exception:
                    pass

            # Quota calculations
            requests_left_today = max(0, DEFAULT_DAILY_LIMIT - today_requests)
            requests_left_minute = max(0, DEFAULT_MINUTE_LIMIT - recent_minute_count)
            daily_pct_used = min(100.0, round((today_requests / DEFAULT_DAILY_LIMIT) * 100, 1))
            minute_pct_used = min(100.0, round((recent_minute_count / DEFAULT_MINUTE_LIMIT) * 100, 1))

            success_rate = (
                round((success_reqs / total_reqs) * 100, 1) if total_reqs > 0 else 100.0
            )

            # Estimated cost in USD
            cost_usd = (p_tokens / 1_000_000 * COST_PER_MILLION_PROMPT) + (
                c_tokens / 1_000_000 * COST_PER_MILLION_OUTPUT
            )

            # Average latency across recent calls
            latencies = [
                inv.get("latency_sec", 0.0)
                for inv in invocations
                if isinstance(inv.get("latency_sec"), (int, float)) and inv.get("latency_sec", 0.0) > 0
            ]
            avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0

            # Daily history formatted and sorted
            daily_history = [
                {
                    "date": d_date,
                    "requests": d_stat.get("requests", 0),
                    "tokens": d_stat.get("tokens", 0),
                }
                for d_date, d_stat in sorted(daily.items())
            ]

            return {
                "summary": {
                    "total_requests": total_reqs,
                    "successful_requests": success_reqs,
                    "failed_requests": failed_reqs,
                    "success_rate_pct": success_rate,
                    "prompt_tokens": p_tokens,
                    "candidate_tokens": c_tokens,
                    "total_tokens": t_tokens,
                    "estimated_cost_usd": round(cost_usd, 4),
                    "avg_latency_sec": avg_latency,
                },
                "quota": {
                    "daily_limit": DEFAULT_DAILY_LIMIT,
                    "today_requests": today_requests,
                    "today_tokens": today_tokens,
                    "requests_left_today": requests_left_today,
                    "daily_pct_used": daily_pct_used,
                    "minute_limit": DEFAULT_MINUTE_LIMIT,
                    "recent_minute_requests": recent_minute_count,
                    "requests_left_minute": requests_left_minute,
                    "minute_pct_used": minute_pct_used,
                    "tier_name": "Gemini Developer API (Free Tier)",
                },
                "daily_history": daily_history,
                "recent_invocations": list(reversed(invocations[-50:])),
            }

    @classmethod
    def reset_stats(cls) -> Dict[str, Any]:
        """Reset usage telemetry."""
        with cls._lock:
            fresh_data = {
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "prompt_tokens": 0,
                "candidate_tokens": 0,
                "total_tokens": 0,
                "daily_usage": {},
                "invocations": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_reset": datetime.now(timezone.utc).isoformat(),
            }
            cls._save_data(fresh_data)
            return {"status": "success", "message": "Usage stats reset successfully."}

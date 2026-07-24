"""
backfill_panoramax_attribution.py
---------------------------------
One-time script: fills in author + license on Panoramax images that were
imported before attribution was tracked.

For every image with source = 'panoramax' and a source_sequence_id but no
author yet, it looks up the sequence on the Panoramax API and writes back
author, license and license_label. Safe to re-run — only touches rows that
are still missing an author.

USAGE:
    cd ~/Desktop/graffiti-atlas
    doppler run -- python worker/backfill_panoramax_attribution.py
    # or, if not using Doppler:
    #   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python worker/backfill_panoramax_attribution.py

REQUIREMENTS:
    pip install supabase
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

from supabase import create_client, Client

PANORAMAX_API = "https://api.panoramax.xyz"

LICENSE_LABELS = {
    "etalab-2.0": "Licence Ouverte / Etalab 2.0",
    "CC-BY-SA 4.0": "CC-BY-SA 4.0",
    "CC-BY-SA-4.0": "CC-BY-SA 4.0",
    "CC-BY-4.0": "CC-BY 4.0",
    "proprietary": "Propriétaire",
}

_CACHE = {}


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set.")
        sys.exit(1)
    return create_client(url, key)


def fetch_attribution(sequence_id: str) -> dict:
    """Look up a sequence's author + license. Fails soft to Nones."""
    if not sequence_id:
        return {"author": None, "license": None, "license_label": None}
    if sequence_id in _CACHE:
        return _CACHE[sequence_id]

    url = f"{PANORAMAX_API}/api/collections/{sequence_id}"
    result = {"author": None, "license": None, "license_label": None}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GraffitiAtlas-backfill"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        lic = data.get("license")
        providers = data.get("providers", []) or []
        author = None
        for role in ("producer", "licensor"):
            for p in providers:
                if role in (p.get("roles") or []):
                    author = p.get("name")
                    break
            if author:
                break
        if not author and providers:
            author = providers[0].get("name")
        result = {
            "author": author,
            "license": lic,
            "license_label": LICENSE_LABELS.get(lic, lic),
        }
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as e:
        print(f"  ! lookup failed for {sequence_id}: {e}")

    _CACHE[sequence_id] = result
    return result


def main():
    supabase = get_supabase()
    print("Connected to Supabase.\n")

    # Pull Panoramax images still missing an author, in pages.
    page_size = 500
    offset = 0
    total_seen = 0
    updated = 0
    skipped_no_seq = 0
    skipped_no_attr = 0

    while True:
        rows = supabase.table("images") \
            .select("id, source_sequence_id, author") \
            .eq("source", "panoramax") \
            .is_("author", "null") \
            .range(offset, offset + page_size - 1) \
            .execute()

        batch = rows.data or []
        if not batch:
            break

        for img in batch:
            total_seen += 1
            seq = img.get("source_sequence_id")
            if not seq:
                skipped_no_seq += 1
                continue

            attr = fetch_attribution(seq)
            if not attr["author"] and not attr["license"]:
                skipped_no_attr += 1
                continue

            supabase.table("images").update({
                "author": attr["author"],
                "license": attr["license"],
                "license_label": attr["license_label"],
            }).eq("id", img["id"]).execute()
            updated += 1

            # Gentle on the Panoramax API (cache means one call per sequence).
            time.sleep(0.05)

        offset += page_size

    print("\n" + "=" * 50)
    print("BACKFILL COMPLETE")
    print("=" * 50)
    print(f"  Images examined:           {total_seen}")
    print(f"  Updated with attribution:  {updated}")
    print(f"  Skipped (no sequence id):  {skipped_no_seq}")
    print(f"  Skipped (no attr found):   {skipped_no_attr}")
    print(f"  Distinct sequences looked up: {len(_CACHE)}")


if __name__ == "__main__":
    main()

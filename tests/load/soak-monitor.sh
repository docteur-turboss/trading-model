#!/usr/bin/env bash
# Samples container RSS and the message-manager journal every N minutes into a CSV,
# during a soak (tests/load/README.md, "Soak"). Stop with Ctrl-C.
#   soak-monitor.sh <out.csv> [interval-minutes=5] [compose-project-prefix=trading-]
#   MM_CONTAINER overrides the message-manager container (default <prefix>message), e.g.
#   MM_CONTAINER=soak647-message-manager-1 for a stack without the fixed container names.
# Columns: timestamp,kind,name,value
#   kind=rss_bytes            value = container memory usage (docker stats)
#   kind=journal_pending      name = topic/service, value = mm_journal_pending_entries
#   kind=journal_oldest_age_s name = topic/service, value = mm_journal_oldest_pending_age_seconds
#   kind=disk_free_gb         name = C: (Docker Desktop disk), watch it: it never shrinks
# The journal metrics come from message-manager /metrics, reachable only over mTLS, so they
# are read with `docker exec` from inside its container (node is there, not curl), with its own SVID.
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite the /run/... paths given to docker exec
out=${1:?usage: soak-monitor.sh <out.csv> [interval-minutes] [container-prefix]}
interval=${2:-5}
prefix=${3:-trading-}
mm=${MM_CONTAINER:-${prefix}message}

echo "timestamp,kind,name,value" > "$out"

to_bytes() { # "12.5MiB" -> bytes
  awk -v s="$1" 'BEGIN{ match(s,/[A-Za-z]+$/); u=substr(s,RSTART); v=substr(s,1,RSTART-1)+0;
    m["B"]=1; m["kB"]=1e3; m["KiB"]=1024; m["MB"]=1e6; m["MiB"]=1048576; m["GB"]=1e9; m["GiB"]=1073741824;
    printf "%.0f", v*m[u] }'
}

while true; do
  ts=$(date -u +%FT%TZ)
  docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | while read -r name usage _; do
    case $name in "$prefix"*) echo "$ts,rss_bytes,$name,$(to_bytes "$usage")" ;; esac
  done >> "$out"

  # Journal gauges: failing to read them is a finding, not something to hide.
  if metrics=$(docker exec "$mm" node -e '
    const https=require("https"),fs=require("fs"),e=process.env;
    https.get({host:"localhost",port:3000,path:"/metrics",key:fs.readFileSync(e.TLS_KEY_PATH),
      cert:fs.readFileSync(e.TLS_CERT_PATH),ca:fs.readFileSync(e.TLS_CA_PATH),
      rejectUnauthorized:false},r=>r.pipe(process.stdout)).on("error",e=>{console.error(e.message);process.exit(1)})'); then
    # No series at all (no topic yet, or metric renamed) must not look like a healthy journal.
    grep -q '^mm_journal_pending_entries{' <<<"$metrics" || echo "$ts,journal_error,$mm,no mm_journal_pending_entries series" >> "$out"
    echo "$metrics" | awk -v ts="$ts" -F'[{} ]' '
      /^mm_journal_pending_entries\{/ {print ts",journal_pending,"$0}
      /^mm_journal_oldest_pending_age_seconds\{/ {print ts",journal_oldest_age_s,"$0}' |
      sed -E 's/,(journal_[a-z_]+),mm_[a-z_]+\{topic="([^"]*)",service="([^"]*)"\} ([0-9.e+-]+)/,\1,\2\/\3,\4/' >> "$out"
  else
    echo "$ts,journal_error,$mm,1" >> "$out"
  fi

  echo "$ts,disk_free_gb,C:,$(df -BG /c | awk 'NR==2{gsub("G","",$4);print $4}')" >> "$out"
  sleep $((interval * 60))
done

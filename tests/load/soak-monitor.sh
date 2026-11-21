#!/usr/bin/env bash
# Samples container RSS and free disk every N minutes into a CSV,
# during a soak (tests/load/README.md, "Soak"). Stop with Ctrl-C.
#   soak-monitor.sh <out.csv> [interval-minutes=5] [compose-project-prefix=trading-]
# Columns: timestamp,kind,name,value
#   kind=rss_bytes            value = container memory usage (docker stats)
#   kind=disk_free_gb         name = C: (Docker Desktop disk), watch it: it never shrinks
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash would rewrite the /run/... paths given to docker exec
out=${1:?usage: soak-monitor.sh <out.csv> [interval-minutes] [container-prefix]}
interval=${2:-5}
prefix=${3:-trading-}

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

  echo "$ts,disk_free_gb,C:,$(df -BG /c | awk 'NR==2{gsub("G","",$4);print $4}')" >> "$out"
  sleep $((interval * 60))
done

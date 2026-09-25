#!/usr/bin/env bash
# Junta stills lado a lado (360px de largura cada) para revisão rápida.
set -e
cd "$(dirname "$0")/out"
inputs=(); filters=""; i=0
for f in "$@"; do inputs+=(-i "still-$f.png"); filters+="[$i:v]scale=360:-1[v$i];"; i=$((i+1)); done
stack=""; for ((j=0;j<i;j++)); do stack+="[v$j]"; done
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "${filters}${stack}hstack=inputs=$i" sheet.png
echo "$(pwd)/sheet.png"

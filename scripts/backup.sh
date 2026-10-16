#!/usr/bin/env bash
# 실행 중인 SQLite를 그대로 복사하지 않고 .backup으로 일관된 사본을 만든 뒤 uploads/와 함께 보관한다.
# 사용: DATA_DIR=/path/to/data scripts/backup.sh <백업을 둘 디렉터리>
set -euo pipefail

DATA_DIR="${DATA_DIR:-./data}"
DEST="${1:?usage: backup.sh <dest-dir>}"
OUT="$DEST/artipin-$(date +%Y%m%d-%H%M%S)"

mkdir -p "$OUT"
# uploads를 먼저 복사한다: 그 사이 삭제된 파일은 DB 사본에 deleted_at이 남아 복원 후에도 일관된다.
cp -R "$DATA_DIR/uploads" "$OUT/uploads"
sqlite3 "$DATA_DIR/app.db" ".backup '$OUT/app.db'"
echo "$OUT"

#!/bin/sh
# Railway production startup script
# Persistent volume mounted at /data — symlink /app/uploads → /data/uploads
# so all routers (which write to /app/uploads) land on the persistent volume.

set -e

# Create persistent dirs on the volume
mkdir -p /data/uploads/photos
mkdir -p /data/uploads/documents
mkdir -p /data/uploads/invoices
mkdir -p /data/uploads/system_documents

# Symlink /app/uploads → /data/uploads (atomic, works if /app/uploads doesn't exist yet)
if [ ! -L /app/uploads ]; then
    rm -rf /app/uploads
    ln -s /data/uploads /app/uploads
fi

echo "✅ Persistent storage linked: /app/uploads → /data/uploads"
echo "✅ Database will be at: /data/watch_db.sqlite"

# Start the API server
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"

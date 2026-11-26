#!/bin/sh
set -e

case "${DATABASE_URL}" in
  postgres://*|postgresql://*)
    echo "[DB] PostgreSQL DATABASE_URL detected -> activating PostgreSQL Prisma schema"
    cp prisma/schema.postgresql.prisma prisma/schema.prisma
    npx prisma generate
    ;;
  *)
    echo "[DB] SQLite DATABASE_URL detected -> using SQLite Prisma schema"
    ;;
esac

npx prisma db push --skip-generate
exec npm start

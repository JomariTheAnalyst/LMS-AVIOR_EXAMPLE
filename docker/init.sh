#!/bin/bash
set -e

if [ -d "/home/frappe/frappe-bench/apps/frappe" ]; then
    echo "Bench already exists, skipping init"
    cd frappe-bench
    bench start
    exit 0
fi

echo "Creating new bench..."

export PATH="${NVM_DIR}/versions/node/v${NODE_VERSION_DEVELOP}/bin/:${PATH}"

bench init --ignore-exist --skip-redis-config-generation --skip-assets frappe-bench

cd frappe-bench

# Use containers instead of localhost
bench set-mariadb-host mariadb
bench set-redis-cache-host redis://redis:6379
bench set-redis-queue-host redis://redis:6379
bench set-redis-socketio-host redis://redis:6379

# Remove redis, watch from Procfile
sed -i '/redis/d' ./Procfile
sed -i '/watch/d' ./Procfile

# lms and avior are bind-mounted -- install into the venv FIRST
uv pip install -e /home/frappe/frappe-bench/apps/lms --python /home/frappe/frappe-bench/env/bin/python
uv pip install -e /home/frappe/frappe-bench/apps/avior --python /home/frappe/frappe-bench/env/bin/python

# prove both import before anything reads apps.txt
env/bin/python -c "import lms, avior"

# payments is not mounted, so clone it -- skip its build
bench get-app payments --skip-assets

grep -qx lms sites/apps.txt || echo lms >> sites/apps.txt
grep -qx avior sites/apps.txt || echo avior >> sites/apps.txt

# node_modules are empty anonymous volumes
cd /home/frappe/frappe-bench/apps/lms
yarn install
cd /home/frappe/frappe-bench/apps/lms/frontend
yarn install
cd /home/frappe/frappe-bench

bench build

bench new-site lms.localhost \
--force \
--mariadb-root-password 123 \
--admin-password admin \
--no-mariadb-socket

bench --site lms.localhost install-app payments lms avior
bench --site lms.localhost set-config developer_mode 1
bench --site lms.localhost enable-scheduler
bench --site lms.localhost clear-cache
bench use lms.localhost

bench start
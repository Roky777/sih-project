# Google Compute Engine deployment: aerocare-server

Prepared 20 October 2026. The owner subsequently executed the VM deployment and permission
recovery; public HTTPS and sign-in verification passed. The agent has not obtained a VM shell.
Historical preparation evidence, current results and remaining acceptance gates are recorded in
[deployment validation](gce_validation.md). This fresh-install runbook is separate from the
existing VM's preserved demo/Qwen overlays; do not reinitialize its secrets or volumes.

Target supplied by the owner: existing `aerocare-server`, region `us-central1` (Iowa),
`e2-standard-2` (2 vCPU, 8 GB RAM), Ubuntu 24.04 LTS x86/64, 50 GB balanced persistent boot
disk, standard provisioning, SSH. The zone, project, VPC, disk contents and external IP must
be discovered. This runbook does not create or replace the VM.

## 1. Discover the actual VM and configure access

Run on your workstation or Cloud Shell with your authorized Google account:

```bash
export PROJECT_ID='YOUR_EXISTING_PROJECT_ID'
gcloud config set project "$PROJECT_ID"
gcloud compute instances list --filter='name=aerocare-server' \
  --format='table(name,zone,machineType,networkInterfaces[0].accessConfigs[0].natIP)'
export VM_ZONE='ZONE_FROM_THE_OUTPUT'
gcloud compute instances describe aerocare-server --zone "$VM_ZONE" \
  --format='yaml(name,zone,machineType,scheduling,disks,networkInterfaces,tags)'
export NETWORK_URI="$(gcloud compute instances describe aerocare-server --zone "$VM_ZONE" --format='value(networkInterfaces[0].network)')"
export NETWORK_NAME="${NETWORK_URI##*/}"
export BOOT_DISK_URI="$(gcloud compute instances describe aerocare-server --zone "$VM_ZONE" --format='value(disks[0].source)')"
gcloud compute disks describe "${BOOT_DISK_URI##*/}" --zone "$VM_ZONE" \
  --format='yaml(sizeGb,type,sourceImage,status)'
gcloud compute firewall-rules list --filter="network:$NETWORK_NAME" \
  --format='table(name,direction,priority,sourceRanges,allowed,targetTags,disabled)'
```

Confirm the zone belongs to `us-central1`, machine type is `e2-standard-2`, boot disk is
50 GB `pd-balanced`, and provisioning is STANDARD/non-preemptible. Inspect disk order before
using `disks[0]` if the VM has multiple disks. Existing organization policies and broad firewall
rules can override this intended access boundary; review them rather than deleting them blindly.

Use IAP SSH if your account already has the required IAP/Compute/OS Login permissions:

```bash
gcloud compute instances add-tags aerocare-server --zone "$VM_ZONE" --tags=aerocare-web
gcloud compute firewall-rules create aerocare-iap-ssh --network "$NETWORK_NAME" \
  --direction=INGRESS --action=ALLOW --rules=tcp:22 \
  --source-ranges=35.235.240.0/20 --target-tags=aerocare-web
gcloud compute ssh aerocare-server --zone "$VM_ZONE" --tunnel-through-iap
```

If the named firewall rule already exists, inspect it instead of recreating it. Direct SSH is
an alternative: create a port-22 rule restricted to your actual administrator CIDR, and omit
`--tunnel-through-iap`. Do not open SSH globally. See Google's
[SSH network access guidance](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/network-access)
and [SSH command reference](https://docs.cloud.google.com/sdk/gcloud/reference/compute/ssh).
No database, broker, management console or API ports need public firewall rules.

## 2. Install the host prerequisites

On the VM, inspect before changing an existing Docker installation. These commands follow
Docker's [Ubuntu installation instructions](https://docs.docker.com/engine/install/ubuntu/).

```bash
cat /etc/os-release
uname -m
df -h /
free -h
sudo apt-get update
sudo apt-get install -y ca-certificates curl git python3 openssl certbot dnsutils
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Require Compose supporting `!override` (2.24.4+). Use `sudo -i` for the remaining VM commands;
Docker access is root-equivalent. Do not change ownership of the Docker socket.

## 3. Transfer the reviewed source and generate secrets

Use `/opt/fleet-maintenance`. Transfer the **reviewed current working tree**, including the
new deployment files: the changes are not yet committed, so cloning the existing remote HEAD
alone will omit them. One option from the local repository is:

```bash
git ls-files --cached --others --exclude-standard -z | \
  tar --null -T - -czf /tmp/aerocare-reviewed-source.tar.gz
gcloud compute scp /tmp/aerocare-reviewed-source.tar.gz aerocare-server:/tmp/ \
  --zone "$VM_ZONE" --tunnel-through-iap
```

Review the archive listing before transfer; include no `.env`, login credentials, keys, local
artifacts or private operational data. On the VM as root:

```bash
install -d -m 0750 /opt/fleet-maintenance
tar -xzf /tmp/aerocare-reviewed-source.tar.gz -C /opt/fleet-maintenance
cd /opt/fleet-maintenance
umask 077
cp .env.production.example .env.production
python3 - <<'PY'
from pathlib import Path
import secrets
p = Path('.env.production')
db, broker = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
values = {
    'FLEET_POSTGRES_PASSWORD': db,
    'FLEET_RABBITMQ_PASSWORD': broker,
    'FLEET_RELEASE_DATABASE_URL': f'postgresql+psycopg://fleet:{db}@postgres:5432/fleet',
    'FLEET_RELEASE_BROKER_URL': f'amqp://fleet:{broker}@rabbitmq:5672//',
}
p.write_text('\n'.join(k+'='+values.get(k,v) if '=' in line else line
    for line in p.read_text().splitlines()
    for k,v in [line.split('=',1) if '=' in line else ('','')])+'\n')
p.chmod(0o600)
PY
install -d -m 0700 /etc/letsencrypt/live/localhost /var/lib/fleet-maintenance/acme
```

Run secret initialization only for a NEW installation. Regenerating passwords does not rotate
credentials in existing persistent databases/brokers. Keep an encrypted independent copy of
the secret file; exclude it from source control, shell tracing and diagnostic configuration logs.
Compose environment variables are accessible to host/Docker administrators.

## 4. Build and pin the actual x86/64 release on the VM

```bash
cd /opt/fleet-maintenance
export RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)"
docker build --target runtime -t "aerocare-api:$RELEASE_ID" backend
docker build -f apps/web/Dockerfile -t "aerocare-web:$RELEASE_ID" .
docker pull --platform linux/amd64 postgres:17-alpine
docker pull --platform linux/amd64 rabbitmq:4-management-alpine
python3 scripts/pin_release_images.py --api "aerocare-api:$RELEASE_ID" \
  --web "aerocare-web:$RELEASE_ID" --output .env.images
```

The pin tool refuses non-Linux/amd64 images and refuses to overwrite old release pins.
Preserve each release's source archive, `.env.images`, image exports/registry retention and
backup together. Builds use locked dependencies; deployment uses exact locally retained
image IDs. Do not prune those images. The resource limits total about 5.4 GiB, leaving host
headroom; they are initial limits, not a capacity guarantee. The worker runs one job at a time.

Define this Bash function for every subsequent VM shell:

```bash
cd /opt/fleet-maintenance
dc() { docker compose --env-file .env.production --env-file .env.images \
  -p aerocare-production -f compose.yaml -f compose.production.yaml \
  -f compose.gce.yaml -f compose.release.yaml "$@"; }
dc config --quiet
dc up -d --wait --no-build --pull never postgres rabbitmq
dc run --rm --no-deps api alembic upgrade head
```

Migrations are explicit and must succeed before the API starts. Normal API restarts do not
run migrations. For upgrades, take a coordinated backup first, stop API/worker/outbox/web,
apply reviewed migrations with the new pinned image, then start the new release. On migration
failure keep writers stopped and investigate; do not blindly downgrade or restore over live data.
Database and artifact volumes persist independently of container replacement. Never use
`docker compose down -v` on this project. RabbitMQ also has a persistent volume and stable node hostname so published, unclaimed jobs
survive container replacement. The database outbox/job leases remain the system of record;
complete broker-volume loss requires reconciliation of queued jobs before accepting new work.

## 5. Verify private HTTPS before you have a domain

The default bootstrap proxy returns 503 to application traffic and supports ACME challenges.
For a usable private site, create a self-signed localhost certificate and select the TLS proxy:

```bash
openssl req -x509 -nodes -newkey rsa:3072 -days 30 \
  -keyout /etc/letsencrypt/live/localhost/privkey.pem \
  -out /etc/letsencrypt/live/localhost/fullchain.pem \
  -subj /CN=localhost -addext subjectAltName=DNS:localhost
chmod 600 /etc/letsencrypt/live/localhost/privkey.pem
sed -i 's/^FLEET_PROXY_TEMPLATE=.*/FLEET_PROXY_TEMPLATE=vm-tls.conf.template/' .env.production
dc up -d --wait --no-build --pull never
dc exec web nginx -t
dc run --rm --no-deps -v "$PWD/scripts:/operator:ro" api \
  python /operator/provision_user.py admin --display-name Administrator --role administrator
dc run --rm --no-deps -v "$PWD/scripts:/operator:ro" api \
  python /operator/provision_user.py supervisor --display-name Supervisor --role supervisor
```

Passwords are prompted. Provision other roles similarly. Install only approved, provenance-
recorded datasets and hash-verified model bundles using the existing onboarding/registration
contracts; production does not seed demonstration records automatically. A fresh installation
without a registered model intentionally fails release acceptance. Local rehearsal records are
synthetic/research data and are not operational aircraft records.

On your workstation open a tunnel (leave it running):

```bash
gcloud compute ssh aerocare-server --zone "$VM_ZONE" --tunnel-through-iap -- \
  -N -L 18443:127.0.0.1:8443
```

Visit `https://localhost:18443`. Its certificate is self-signed, not publicly trusted. Obtain
only the public certificate through your authenticated SSH connection:

```bash
gcloud compute ssh aerocare-server --zone "$VM_ZONE" --tunnel-through-iap \
  --command 'sudo cat /etc/letsencrypt/live/localhost/fullchain.pem' > aerocare-localhost.pem
curl --cacert aerocare-localhost.pem https://localhost:18443/api/health/ready
```

Use that certificate only for this private endpoint;
do not globally disable TLS verification. The allowed origin already matches this tunnel.
Port 8080 only redirects HTTP; use the HTTPS URL with its explicit tunnel port.

The configured `qwen3:8b` service remains unchanged. It is currently unavailable locally and
must be reachable from the API before the runtime gate can pass. An 8-GB VM hosting the entire
stack has no validated capacity for this model; do not assume that installing it locally will
fit. No model download or provider/configuration substitution is authorized by this preparation.

## 6. Backups, monitoring and release acceptance

```bash
python3 scripts/backup_local.py --env-file .env.production --env-file .env.images \
  --project-name aerocare-production --compose compose.yaml --compose compose.production.yaml \
  --compose compose.gce.yaml --compose compose.release.yaml \
  --output-root /var/backups/fleet-maintenance
bash scripts/release_check.sh .env.production aerocare-production .env.images
docker stats --no-stream
df -h /
dc logs --since 10m api worker outbox web
```

Backup stops writers and web for consistency and restores their previous running state even
on failure. It captures a PostgreSQL dump, schema/table fingerprints and artifact hashes;
secrets are separate. Before acceptance, use `scripts/restore_local.py` in a NEW dedicated
`fleet-release-restored...` verification project on an isolated host, verify hashes/fingerprints,
then run the required user journeys. That script uses `compose.verify.yaml`, local verification
images and ports 18000/18080, not the public production project. Preserve those images too.

After agreeing the maintenance window, install the supplied timers:

```bash
install -m 0644 infra/systemd/fleet-maintenance-* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now fleet-maintenance-monitor.timer fleet-maintenance-backup.timer
systemctl list-timers 'fleet-maintenance-*'
journalctl -u fleet-maintenance-monitor.service -u fleet-maintenance-backup.service --since today
```

Backup defaults to 02:00 UTC daily and causes maintenance downtime. Configure an approved
alert destination for nonzero monitor/backup exits and encrypted off-VM backup retention.
The 50-GB boot disk is not an independent backup. Monitor free space, inode pressure, OOM,
queue/outbox age, certificate expiry and backup age. Docker logs rotate at 10 MB × 5 per service;
restart policies recover exited processes, while health checks alone do not restart a hung
process. The monitor reports unhealthy services, migration mismatch, expired leases, overdue
work, missing accounts/models, bad model hashes, unavailable assistant and overdue backups.
It deliberately exits nonzero while a blocker remains.

## 7. Attach a domain later

On your workstation/Cloud Shell, verify the IP rather than copying an old value:

```bash
export EXTERNAL_IP="$(gcloud compute instances describe aerocare-server --zone "$VM_ZONE" \
  --format='value(networkInterfaces[0].accessConfigs[0].natIP)')"
test -n "$EXTERNAL_IP"
gcloud compute addresses list --filter="address=$EXTERNAL_IP"
```

If it is ephemeral, promote the existing address, without changing it:

```bash
gcloud compute addresses create aerocare-ip --region us-central1 --addresses "$EXTERNAL_IP"
```

If already reserved, retain the existing reservation. If the VM has no external IP, provision
one through the existing network policy before continuing. See Google's
[static IP guidance](https://docs.cloud.google.com/vpc/docs/reserve-static-external-ip-address).
Buy/control a domain first; at its authoritative DNS provider create an A record for your
chosen hostname pointing to the verified IP. Do not create an AAAA record without working
IPv6. If your authoritative zone is in Cloud DNS, use the [record creation command](https://docs.cloud.google.com/sdk/gcloud/reference/dns/record-sets/create). The public access rule uses the [firewall rule command](https://docs.cloud.google.com/sdk/gcloud/reference/compute/firewall-rules/create):

```bash
export DOMAIN='YOUR_ACTUAL_HOSTNAME'
export DNS_ZONE='YOUR_EXISTING_CLOUD_DNS_ZONE'
gcloud dns record-sets create "$DOMAIN." --zone "$DNS_ZONE" --type A --ttl 300 \
  --rrdatas "$EXTERNAL_IP"
dig +short "$DOMAIN" A
gcloud compute firewall-rules create aerocare-https --network "$NETWORK_NAME" \
  --direction INGRESS --action ALLOW --rules tcp:80,tcp:443 \
  --source-ranges 0.0.0.0/0 --target-tags aerocare-web
```

Inspect existing records/rules first; update rather than create if they already exist.
On the VM, edit ONLY these keys in `.env.production` (substitute the actual hostname):

```dotenv
DEPLOYMENT_DOMAIN=YOUR_ACTUAL_HOSTNAME
FLEET_ALLOWED_ORIGINS=["https://YOUR_ACTUAL_HOSTNAME"]
FLEET_BIND_ADDRESS=0.0.0.0
FLEET_HTTP_PORT=80
FLEET_HTTPS_PORT=443
FLEET_PROXY_TEMPLATE=vm-bootstrap.conf.template
```

```bash
dc up -d --no-build --pull never api worker outbox web
export DOMAIN='YOUR_ACTUAL_HOSTNAME'
export CERT_EMAIL='YOUR_CERTIFICATE_CONTACT_EMAIL'
certbot certonly --webroot -w /var/lib/fleet-maintenance/acme \
  -d "$DOMAIN" --email "$CERT_EMAIL" --agree-tos --no-eff-email
sed -i 's/^FLEET_PROXY_TEMPLATE=.*/FLEET_PROXY_TEMPLATE=vm-tls.conf.template/' .env.production
dc up -d --wait --no-build --pull never web
dc exec web nginx -t
```

Install a Certbot deployment hook to reload the proxy after successful renewals:

```bash
install -d /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/aerocare <<'EOF'
#!/bin/sh
set -eu
cd /opt/fleet-maintenance
docker compose --env-file .env.production --env-file .env.images -p aerocare-production \
  -f compose.yaml -f compose.production.yaml -f compose.gce.yaml -f compose.release.yaml \
  exec -T web sh -c 'nginx -t && nginx -s reload'
EOF
chmod 700 /etc/letsencrypt/renewal-hooks/deploy/aerocare
systemctl enable --now certbot.timer
certbot renew --dry-run --run-deploy-hooks
bash scripts/release_check.sh .env.production aerocare-production .env.images
```

From outside the VM verify trusted HTTPS, HTTP redirect, secure login/CSRF, all role workflows,
uploads, queued work, artifact serving, streaming, restart/recovery, backups and resource use.
Record exact source/image pins and results. Deployment is complete only after the application
is running and verified on this VM. Independent security, accessibility/intended-user,
representative workload/data and operational acceptance remain separate documented gates;
the demonstrator is not aircraft clearance software.

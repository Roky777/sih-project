# Two-month hosting assessment

Assessment date: 2026-10-19. This is deployment planning, not an executed cloud
installation or an availability guarantee. No cloud resources or accounts were
created by this assessment.

## Current state

The user supplied `https://aerocare.onslate.com` and a Slate screenshot reporting
a successful frontend deployment. The screenshot preview reported the backend
offline. Full public application operation has not been independently verified.

Repository inspection confirms six Compose services: web, API, PostgreSQL,
RabbitMQ, Celery worker and outbox dispatcher. PostgreSQL and model artifacts use
named volumes. The AWS demo overlay also persists broker data. The runtime image
uses Python 3.13; its API startup command is supplied by Compose, not the image.
Uploading that image alone is not equivalent to deploying the application.

## Catalyst feasibility

The [student program](https://catalyst.zoho.com/students/) advertises $250 of
qualifying non-commercial use over six months without a card. At the threshold,
the application stops unless additional usage is approved. Confirm the actual
account's student entitlement; ordinary promotional credits have different
payment-method requirements.

[AppSail execution documentation](https://docs.catalyst.zoho.com/en/serverless/help/appsail/appsail-basics/)
describes inactive-instance scale-down after five minutes, a ten-second startup
deadline and a thirty-second request timeout. Container support does not establish
support for Compose volumes, a durable PostgreSQL server, AMQP or continuously
running worker processes. The existing SSE connection also requires explicit
deployment validation against the request timeout.

[CloudScale](https://catalyst.zoho.com/cloud-scale.html) offers its own Data Store
and ZCQL, not a demonstrated drop-in PostgreSQL deployment for this application's
SQLAlchemy/Alembic contracts. No supported way to host the complete unchanged
stateful stack inside Catalyst was established in this assessment. External
PostgreSQL, broker, workers and artifact storage would require separate hosting
and billing; Catalyst credits must not be assumed to cover those providers.

Conclusion: keep Slate, but do not proceed with the API form as though that
completes deployment. A Catalyst-native migration is a separate engineering
project involving persistence, transactions, job recovery and artifact contracts.
Do not replace these with ephemeral storage, synchronous jobs or fabricated data.

## Recommended candidate: trial-funded Ubuntu virtual machine

Subject to account eligibility and payment verification, evaluate a Google Compute
Engine Ubuntu 24.04 x86 VM using the existing Compose stack. The
[Google Cloud trial](https://cloud.google.com/signup-faqs) offers eligible new users
$300 for 90 days. Payment verification is required; a non-upgraded trial shuts
down at expiry or credit exhaustion. Confirm remaining time and credits in the
actual account before creating resources. Zoho credits cannot pay Google bills.

An `e2-standard-2` (2 vCPU, 8 GiB RAM) is a starting sizing hypothesis, not tested
capacity. Google's [general-purpose pricing table](https://cloud.google.com/products/compute/pricing/general-purpose)
lists a reference on-demand rate of $0.06701142/hour: 1,440 hours (60 days) is
approximately $96.50 for compute alone at that rate. Region, disk, IPv4, snapshots,
network transfer and any additional services change the total. Use the actual
console estimate before launch; retain a substantial credit reserve and monitor
daily usage. Budget alerts are notifications, not spending caps. Do not use Spot
or preemptible capacity for the requested continuously available demo.

## Installation and acceptance sequence

1. Confirm trial eligibility, usable payment verification, credit balance and at
   least the full required hosting period remaining. Otherwise select another
   eligible VM credit program or an explicitly budgeted host.
2. Review the regional VM/disk/IP estimate, then create the authorized host with
   a reserved public IP, Ubuntu 24.04 x86 and persistent disk. Restrict operator
   access; publish only HTTP/HTTPS application traffic.
3. Install official Docker Engine/Compose. Adapt the existing
   [EC2 procedure](ec2_deployment.md) to the supplied host paths and hostname.
   Do not run `scripts/deploy_aws_demo.sh` unchanged: it assumes an AWS user/path,
   pins an older source revision and rewrites the AWS demo overlay.
4. Use a reviewed current revision, private generated credentials, dedicated
   synthetic-demo database and persistent database/broker/artifact volumes.
   Apply migrations and verify the retained model bundle hash before installing.
   Disable the optional local Ollama assistant unless a separate supported
   inference service is deliberately configured; do not train models on the VM.
5. Obtain publicly trusted HTTPS and test certificate renewal. Serve web and API
   on the same origin to avoid cross-site session-cookie dependence. Provision
   appropriate accounts with the existing interactive account tool.
6. Verify readiness, login/logout, roles/CSRF, actual queued assessment, planning,
   simulation, approval and work recording; verify SSE/reconnect and reboot/job
   recovery. Never use a homepage HTTP 200 as proof that predictions work.
7. Rehearse coordinated backup/restore separately. The existing backup tool
   briefly stops writers, so scheduling it causes an interruption; select and
   validate a different backup method if uninterrupted writes are mandatory.
8. Add external uptime alerts, disk/queue monitoring, credit alerts and off-host
   backup retention. Retain source revision and acceptance evidence.

The Slate URL can remain a stable entry link using the existing full-app redirect
configuration after the VM origin is verified. This changes the browser's address
to the VM hostname; it does not keep `aerocare.onslate.com` in the address bar.
Keeping that exact origin for the entire session would require a verified reverse
proxy arrangement. Do not merely set a cross-site API URL and assume cookies work.

## Updates and availability

Test reviewed revisions separately, back up state, review migration compatibility,
then rebuild/recreate services while retaining volumes and the public hostname.
Do not use `down -v`. A normal single-host Compose update can interrupt requests.
The proposed VM avoids idle sleep but has no host failover or zero-downtime
guarantee. Literal uninterrupted service requires a separately designed redundant
deployment, including database and broker availability. No two-month cost,
capacity or uptime result has yet been measured for this project.

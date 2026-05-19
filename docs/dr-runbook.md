# KokoMovie PC — Disaster Recovery Runbook

**Version:** 1.0.0  
**Date:** May 2026  
**RTO Target:** < 15 minutes  
**RPO Target:** < 5 minutes  
**Primary Region:** us-east-1  
**DR Region:** us-west-2  

---

## Overview

This runbook covers the full failover procedure from us-east-1 to us-west-2 following a regional outage or critical degradation event. It is intended for on-call engineers and SREs.

**Incident Commander:** Declares DR state, owns go/no-go for each phase.  
**Database Engineer:** Executes Aurora Global Database promotion.  
**Platform Engineer:** Executes ECS and infrastructure failover.  
**Networking Engineer:** Validates Route 53 health checks and executes DNS failover.

---

## 1. Decision Criteria — When to Declare DR

Declare a DR event when **any** of the following conditions are met for > 5 consecutive minutes:

| Condition | Signal |
|---|---|
| us-east-1 ALB 5xx rate > 25% | CloudWatch ALB `HTTPCode_ELB_5XX_Count` alarm |
| ECS service health < 50% across all services | CloudWatch ECS `ServiceHealthCheck` composite alarm |
| RDS Aurora writer unresponsive | CloudWatch `DatabaseConnections` drops to 0 + `CPUUtilization` alarm absent |
| Route 53 primary health check failing > 2 consecutive intervals | Route 53 health check console |
| AWS Service Health Dashboard shows us-east-1 impact | https://health.aws.amazon.com |

**Do not** declare DR for single-service degradation — use standard service rollback procedure instead.

---

## 2. Pre-Failover Checklist (< 2 minutes)

```
[ ] Declare DR event in #incident Slack channel — include timestamp and trigger condition
[ ] Page all on-call roles (Incident Commander, DB Engineer, Platform Engineer, Networking)
[ ] Verify DR region (us-west-2) ECS services are warm-standby (target task count = 0, cluster exists)
[ ] Check DynamoDB Global Tables replication lag — acceptable if < 5 minutes behind
[ ] Check Aurora Global Database replication lag — must be < 30 seconds for RPO < 5 min
[ ] Disable Terraform CI/CD GitHub Actions workflow to prevent unintended applies during failover
```

Check Aurora replication lag:
```bash
aws rds describe-global-clusters \
  --global-cluster-identifier kokomovie-global \
  --query 'GlobalClusters[0].GlobalClusterMembers[*].{Region:DBClusterArn,Lag:GlobalWriteForwardingStatus}' \
  --region us-east-1
```

Check DynamoDB replication lag:
```bash
aws dynamodb describe-table --table-name playback_sessions --region us-west-2 \
  --query 'Table.Replicas[?RegionName==`us-east-1`].ReplicaStatusDescription'
```

---

## 3. Phase 1 — Aurora PostgreSQL Failover (< 5 minutes)

Aurora Global Database maintains a secondary cluster in us-west-2 with < 1 second replication lag under normal conditions.

### 3.1 Promote the us-west-2 Secondary

```bash
aws rds failover-global-cluster \
  --global-cluster-identifier kokomovie-global \
  --target-db-cluster-identifier arn:aws:rds:us-west-2:ACCOUNT_ID:cluster:kokomovie-db-west \
  --region us-east-1
```

> **Note:** If us-east-1 is completely unreachable, use the `--allow-data-loss` flag only with Incident Commander approval. This risks losing < RPO seconds of writes.

```bash
# With data-loss flag (Incident Commander approval required):
aws rds failover-global-cluster \
  --global-cluster-identifier kokomovie-global \
  --target-db-cluster-identifier arn:aws:rds:us-west-2:ACCOUNT_ID:cluster:kokomovie-db-west \
  --allow-data-loss \
  --region us-west-2
```

### 3.2 Verify Promotion

```bash
# Poll until status = "available" (typically 2-4 minutes)
watch -n 10 'aws rds describe-db-clusters \
  --db-cluster-identifier kokomovie-db-west \
  --region us-west-2 \
  --query "DBClusters[0].{Status:Status,Endpoint:Endpoint}"'
```

Expected output once ready:
```json
{
  "Status": "available",
  "Endpoint": "kokomovie-db-west.cluster-XXXXX.us-west-2.rds.amazonaws.com"
}
```

### 3.3 Update Secrets Manager in us-west-2

The promoted cluster has a new writer endpoint. Update the secret:

```bash
NEW_ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier kokomovie-db-west \
  --region us-west-2 \
  --query 'DBClusters[0].Endpoint' --output text)

aws secretsmanager update-secret \
  --secret-id kokomovie/production/db-credentials \
  --secret-string "{\"host\":\"${NEW_ENDPOINT}\",\"port\":5432,\"database\":\"kokomovie\",\"username\":\"kokomovie_app\",\"password\":\"$(aws secretsmanager get-secret-value --secret-id kokomovie/production/db-credentials --region us-east-1 --query SecretString --output text 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"password\"])')\"}" \
  --region us-west-2
```

---

## 4. Phase 2 — DynamoDB (< 1 minute)

DynamoDB Global Tables in us-east-1 + us-west-2 are **active-active** with eventual consistency. No promotion step is required — the us-west-2 replica is already writable.

### 4.1 Verify Table Availability

```bash
for table in playback_sessions playback_positions watchlists viewing_history ab_experiments ab_assignments; do
  STATUS=$(aws dynamodb describe-table --table-name $table --region us-west-2 \
    --query 'Table.TableStatus' --output text 2>/dev/null)
  echo "$table: $STATUS"
done
```

All tables must show `ACTIVE`. If any show `CREATING` or `UPDATING`, wait 60 seconds and recheck.

### 4.2 Verify Replication Lag Acceptable

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ReplicationLatency \
  --dimensions Name=TableName,Value=playback_positions Name=ReceivingRegion,Value=us-west-2 \
  --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Maximum \
  --region us-east-1 \
  --query 'Datapoints[*].Maximum' --output text
```

Acceptable if last known lag < 300,000 ms (5 minutes). Beyond 5 minutes, playback resume positions may be stale — log this in the incident ticket.

---

## 5. Phase 3 — ElastiCache Redis (< 3 minutes)

ElastiCache does **not** have cross-region replication in the current architecture. The DR Redis cluster in us-west-2 is a warm-standby that starts with an empty keyspace.

**Impact:** On failover, all cached data (catalog browse, recommendations, JWT denylist) is lost. Services are designed to handle cold cache gracefully:

- Catalog browse/genres: falls through to PostgreSQL (elevated latency for first ~60s)
- Recommendations: falls through to catalog trending
- JWT denylist: **important** — recently revoked tokens could be re-used for up to 15 minutes (access token TTL) if the denylist is empty. This is an accepted risk window documented in the security audit.

### 5.1 Verify DR Redis Cluster is Running

```bash
aws elasticache describe-replication-groups \
  --replication-group-id kokomovie-redis-west \
  --region us-west-2 \
  --query 'ReplicationGroups[0].{Status:Status,PrimaryEndpoint:NodeGroups[0].PrimaryEndpoint.Address}'
```

If the cluster is stopped (cost-saving measure in standby), start it:
```bash
# ElastiCache serverless does not support stop/start; if using standard cluster:
# Typically the DR cluster is always running at reduced capacity — verify in Terraform
terraform apply -target=module.elasticache -var-file=envs/production-dr.tfvars
```

### 5.2 Update Secrets Manager with DR Redis Endpoint

```bash
DR_REDIS_ENDPOINT=$(aws elasticache describe-replication-groups \
  --replication-group-id kokomovie-redis-west \
  --region us-west-2 \
  --query 'ReplicationGroups[0].NodeGroups[0].PrimaryEndpoint.Address' --output text)

aws secretsmanager update-secret \
  --secret-id kokomovie/production/redis-auth \
  --secret-string "{\"host\":\"${DR_REDIS_ENDPOINT}\",\"port\":6379,\"authToken\":\"$(aws secretsmanager get-secret-value --secret-id kokomovie/production/redis-auth --region us-east-1 --query SecretString --output text 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin)[\"authToken\"])')\"}" \
  --region us-west-2
```

---

## 6. Phase 4 — MSK Kafka (< 2 minutes)

MSK does not support cross-region replication in the current architecture. Event streaming is non-critical for immediate service availability — services degrade gracefully if Kafka is unavailable (playback events are fire-and-forget).

### 6.1 Verify DR MSK Cluster

```bash
aws kafka list-clusters --region us-west-2 \
  --query 'ClusterInfoList[?ClusterName==`kokomovie-msk-west`].{State:State,BrokerCount:NumberOfBrokerNodes}'
```

If `State` is `CREATING` or cluster does not exist, trigger Terraform:
```bash
cd infra/terraform
terraform apply -target=module.msk -var-file=envs/production.tfvars -var="aws_region=us-west-2"
```

MSK cluster creation takes ~15 minutes — Kafka-dependent features (recommendation updates, analytics) will be delayed. Core playback and auth are unaffected.

---

## 7. Phase 5 — ECS Service Failover (< 5 minutes)

### 7.1 Scale Up DR ECS Services

The DR ECS cluster (`kokomovie-services-west`) exists but runs at 0 tasks to reduce cost. Scale all services to production capacity:

```bash
SERVICES=(auth catalog playback user recommendation billing)

for svc in "${SERVICES[@]}"; do
  aws ecs update-service \
    --cluster kokomovie-services-west \
    --service kokomovie-${svc}-west \
    --desired-count 3 \
    --region us-west-2
  echo "Scaling ${svc} to 3 tasks..."
done
```

### 7.2 Force New Deployment (picks up updated Secrets Manager values)

```bash
for svc in "${SERVICES[@]}"; do
  aws ecs update-service \
    --cluster kokomovie-services-west \
    --service kokomovie-${svc}-west \
    --force-new-deployment \
    --region us-west-2
done
```

### 7.3 Monitor ECS Deployment

```bash
# Watch until all services reach steady state
watch -n 15 'aws ecs describe-services \
  --cluster kokomovie-services-west \
  --services kokomovie-auth-west kokomovie-catalog-west kokomovie-playback-west \
            kokomovie-user-west kokomovie-recommendation-west kokomovie-billing-west \
  --region us-west-2 \
  --query "services[*].{Name:serviceName,Running:runningCount,Desired:desiredCount,Status:deployments[0].rolloutState}"'
```

Expected when ready:
```
Name                           Running  Desired  Status
kokomovie-auth-west           3        3        COMPLETED
kokomovie-catalog-west        3        3        COMPLETED
kokomovie-playback-west       3        3        COMPLETED
kokomovie-user-west           3        3        COMPLETED
kokomovie-recommendation-west 3        3        COMPLETED
kokomovie-billing-west        3        3        COMPLETED
```

### 7.4 Verify ALB Health Checks

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names kokomovie-auth-tg-west \
    --region us-west-2 \
    --query 'TargetGroups[0].TargetGroupArn' --output text) \
  --region us-west-2 \
  --query 'TargetHealthDescriptions[*].{Target:Target.Id,State:TargetHealth.State}'
```

All targets must show `healthy` before proceeding to DNS failover.

---

## 8. Phase 6 — Route 53 DNS Failover (< 2 minutes)

Route 53 health checks monitor the primary ALB endpoint. If health checks have already triggered automatic failover, verify and skip to step 8.3.

### 8.1 Check Current Routing

```bash
# Verify which region is currently serving traffic
dig +short api.kokomovie.com

# Check health check status
aws route53 get-health-check-status \
  --health-check-id $(aws route53 list-health-checks \
    --query 'HealthChecks[?HealthCheckConfig.FullyQualifiedDomainName==`api.kokomovie.com`].Id' \
    --output text) \
  --query 'HealthCheckObservations[*].{Region:Region,Status:StatusReport.Status}'
```

### 8.2 Force Failover (if not triggered automatically)

If Route 53 has not automatically failed over (health checks show `Success` for primary despite outage), manually update the routing policy:

```bash
# Get current hosted zone ID
ZONE_ID=$(aws route53 list-hosted-zones \
  --query 'HostedZones[?Name==`kokomovie.com.`].Id' \
  --output text | cut -d'/' -f3)

# Get us-west-2 ALB DNS name
DR_ALB=$(aws elbv2 describe-load-balancers \
  --names kokomovie-alb-west \
  --region us-west-2 \
  --query 'LoadBalancers[0].DNSName' --output text)

# Update the api.kokomovie.com record to point to DR ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id $ZONE_ID \
  --change-batch "{
    \"Changes\": [{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"api.kokomovie.com\",
        \"Type\": \"A\",
        \"AliasTarget\": {
          \"HostedZoneId\": \"Z1H1FL5HABSF5\",
          \"DNSName\": \"${DR_ALB}\",
          \"EvaluateTargetHealth\": true
        }
      }
    }]
  }"
```

### 8.3 Verify DNS Propagation

```bash
# Check from multiple vantage points
for resolver in 8.8.8.8 1.1.1.1 9.9.9.9; do
  echo -n "$resolver: "
  dig +short @$resolver api.kokomovie.com
done
```

DNS TTL is 60 seconds. Allow up to 2 minutes for propagation.

---

## 9. Post-Failover Verification Checklist

Run the k6 smoke test against the DR region within 2 minutes of DNS propagation:

```bash
k6 run \
  --env BASE_URL=https://api.kokomovie.com \
  load-tests/k6/smoke.js
```

All checks must pass (rate == 1.0).

Manual verification checklist:

```
[ ] Auth: POST /auth/login returns 200 with tokens
[ ] Auth: POST /auth/refresh returns 200 with new tokens
[ ] Catalog: GET /catalog/browse returns 200 with items
[ ] Catalog: GET /catalog/search?q=test returns 200
[ ] Playback: GET /health returns {status: "ok"}
[ ] User: GET /user/profiles returns 200
[ ] Billing: GET /billing/plans returns 200 with 3 plans
[ ] End-to-end: Create playback session + receive manifestUrl
[ ] CloudWatch: No ECS task exit codes in DR cluster (us-west-2 alarms)
[ ] Error rate: API 5xx rate < 1% in DR region (ALB metrics)
[ ] Latency: p95 < 500ms across all endpoints (ALB TargetResponseTime)
```

---

## 10. RTO / RPO Validation

| Metric | Target | How to Measure |
|---|---|---|
| RTO | < 15 minutes | Time from DR declaration to smoke test passing |
| RPO | < 5 minutes | Aurora promotion: check `aws rds describe-global-clusters` replication lag at time of failure |

Record actual RTO and RPO in the incident ticket for each DR drill.

---

## 11. Failback Procedure (Post-Incident)

Once us-east-1 is healthy:

1. **Do not rush failback** — confirm us-east-1 is stable for > 30 minutes before failback.
2. Re-add us-east-1 as a secondary to the Aurora Global Database:
   ```bash
   aws rds create-db-cluster \
     --db-cluster-identifier kokomovie-db-east-restored \
     --engine aurora-postgresql \
     --global-cluster-identifier kokomovie-global \
     --region us-east-1
   ```
3. Wait for replication to catch up (check lag < 30s).
4. Promote us-east-1 back using the same failover procedure (Phase 1) in reverse.
5. Scale ECS services in us-east-1 back to desired count.
6. Update Route 53 to point back to us-east-1 ALB.
7. Scale down us-west-2 ECS services to 0 (warm standby).
8. Re-enable Terraform CI/CD workflow.
9. Write post-incident review — include RTO/RPO actuals, root cause, follow-up action items.

---

## 12. DR Drill Schedule

| Frequency | Scope | Owner |
|---|---|---|
| Monthly | Smoke test only — verify DR region can serve traffic | Platform Engineer |
| Quarterly | Full failover drill — execute all phases, validate RTO/RPO | Incident Commander |
| On architecture change | Full failover drill — after any infrastructure change | DevOps Agent |

**Quarterly DR Drill Command:**
```bash
# Set a timer for RTO measurement
START=$(date +%s)

# Execute all phases (1-9) in order...
# After smoke test passes:
END=$(date +%s)
echo "RTO: $((END - START)) seconds"
```

Actual RTO must be recorded in `docs/dr-drill-log.md` after each drill with:
- Date
- Incident Commander
- Trigger scenario
- Actual RTO (seconds)
- Actual RPO (seconds, from Aurora replication lag at promotion time)
- Issues encountered
- Follow-up action items

---

## 13. Emergency Contacts & Resources

| Resource | Location |
|---|---|
| AWS Service Health | https://health.aws.amazon.com |
| Terraform state (S3 backend) | `s3://kokomovie-terraform-state/production/terraform.tfstate` |
| CloudWatch dashboards | CloudWatch console → Dashboards → `kokomovie-production` |
| Grafana (if configured) | Internal Grafana instance |
| Route 53 hosted zone | AWS console → Route 53 → Hosted zones → `kokomovie.com` |
| Aurora Global Database | AWS console → RDS → Global databases → `kokomovie-global` |
| ECR repositories | `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/kokomovie-*` |

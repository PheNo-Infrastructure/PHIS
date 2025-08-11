# Azure VM Usage Monitoring Guide

## 🔍 **Monitor VM Usage & Right-Size Your OpenSILEX Deployment**

### **1. Azure Portal Monitoring**

#### **Access VM Metrics**
1. Go to Azure Portal → Virtual Machines → [Your VM Name]
2. Navigate to **Monitoring** section:
   - **Metrics**: Real-time CPU, memory, disk, network usage
   - **Insights**: Detailed performance analysis
   - **Alerts**: Set up notifications for high usage

#### **Key Metrics to Monitor**
```yaml
CPU Usage:
  - Target: 50-70% average (allows for peaks)
  - Alert if: >80% for >15 minutes
  - Scale down if: <30% consistently

Memory Usage:
  - OpenSILEX needs: 32GB minimum
  - Monitor: Available memory
  - Alert if: <8GB free (critical)

Disk Performance:
  - Monitor: IOPS and throughput
  - Database storage: /home/opensilex/data
  - Alert if: >80% disk space used

Network:
  - Monitor: Data in/out
  - Typical: Low traffic unless heavy API usage
```

### **2. Azure CLI Monitoring Commands**

#### **Install Azure CLI** (if not already installed)
```bash
# Windows (PowerShell)
Invoke-WebRequest -Uri https://aka.ms/installazurecliwindows -OutFile .\AzureCLI.msi
Start-Process msiexec.exe -Wait -ArgumentList '/I AzureCLI.msi /quiet'

# Login
az login
```

#### **Useful Monitoring Commands**
```bash
# Get VM status
az vm show -g RG-OPENSILEX-debian12 -n phis-debian12 --query "instanceView.statuses"

# Get VM sizes available (for right-sizing)
az vm list-sizes --location westeurope --output table

# Get current VM details
az vm show -g RG-OPENSILEX-debian12 -n phis-debian12 --query "{Name:name, Size:hardwareProfile.vmSize, Location:location}"

# Check spot instance pricing
az vm list-usage --location westeurope -o table

# Get cost analysis (requires Billing Reader role)
az consumption usage list --start-date 2025-01-01 --end-date 2025-08-11
```

### **3. Inside VM Monitoring**

#### **SSH into VM and Install htop**
```bash
ssh azureuser@[YOUR_VM_IP]
sudo apt update && sudo apt install -y htop iotop nethogs

# Real-time system monitoring
htop                    # CPU, memory, processes
sudo iotop              # Disk I/O usage
sudo nethogs            # Network usage by process
```

#### **OpenSILEX Specific Monitoring**
```bash
# Check Docker container resource usage
docker stats

# Check OpenSILEX processes
ps aux | grep -E "(java|opensilex|mongodb|rdf4j)"

# Monitor database sizes
echo "=== Database Storage Usage ==="
du -sh /home/opensilex/data/*
docker exec opensilex-mongodb mongosh --eval "db.stats()"

# Check Java heap usage
sudo -u opensilex jstat -gc $(pgrep -f opensilex.jar)
```

### **4. Azure Monitor Alerts Setup**

#### **Create CPU Alert**
```bash
# High CPU alert
az monitor metrics alert create \
  --name "OpenSILEX High CPU" \
  --resource-group RG-OPENSILEX-debian12 \
  --scopes /subscriptions/[SUBSCRIPTION_ID]/resourceGroups/RG-OPENSILEX-debian12/providers/Microsoft.Compute/virtualMachines/phis-debian12 \
  --condition "avg Percentage CPU > 80" \
  --evaluation-frequency 5m \
  --window-size 15m
```

#### **Create Memory Alert**
```bash
# Low memory alert  
az monitor metrics alert create \
  --name "OpenSILEX Low Memory" \
  --resource-group RG-OPENSILEX-debian12 \
  --scopes /subscriptions/[SUBSCRIPTION_ID]/resourceGroups/RG-OPENSILEX-debian12/providers/Microsoft.Compute/virtualMachines/phis-debian12 \
  --condition "avg Available Memory Bytes < 8589934592" \
  --evaluation-frequency 5m \
  --window-size 15m
```

### **5. Cost Monitoring**

#### **Azure Cost Management**
1. **Portal**: Azure Portal → Cost Management + Billing → Cost Analysis
2. **Filter by**: Resource Group = "RG-OPENSILEX-debian12"
3. **Group by**: Service name or Resource
4. **View**: Daily costs, monthly trends

#### **Set Budget Alerts**
```bash
# Create budget (example: $200/month)
az consumption budget create \
  --resource-group RG-OPENSILEX-debian12 \
  --budget-name "OpenSILEX-Monthly-Budget" \
  --amount 200 \
  --time-grain Monthly \
  --start-date "2025-01-01T00:00:00Z" \
  --end-date "2026-01-01T00:00:00Z"
```

### **6. Right-Sizing Recommendations**

#### **When to Scale Down**
```yaml
Scale from E8s_v4 to E4s_v4 (32GB RAM) if:
  - CPU usage: <40% consistently
  - Memory usage: <24GB consistently  
  - No performance issues
  - Cost savings: ~50%

Scale from E8s_v4 to D4s_v4 (16GB RAM) if:
  - CPU usage: <30% consistently
  - Memory usage: <12GB consistently
  - Running minimal workload
  - Cost savings: ~65%
```

#### **When to Scale Up**
```yaml
Scale from E8s_v4 to E16s_v4 (128GB RAM) if:
  - Memory usage: >80% consistently
  - Frequent out-of-memory errors
  - Large dataset processing
  - Multiple concurrent users
```

### **7. Automated Right-Sizing Script**

#### **PowerShell Monitoring Script**
```powershell
# Add to your opensilex-github.ps1 or run separately
function Check-VMUsage {
    param([string]$ResourceGroupName, [string]$VMName)
    
    # Get 7-day average metrics
    $endTime = Get-Date
    $startTime = $endTime.AddDays(-7)
    
    $cpuMetrics = az monitor metrics list `
        --resource "/subscriptions/$((Get-AzContext).Subscription.Id)/resourceGroups/$ResourceGroupName/providers/Microsoft.Compute/virtualMachines/$VMName" `
        --metric "Percentage CPU" `
        --start-time $startTime.ToString("yyyy-MM-ddTHH:mm:ssZ") `
        --end-time $endTime.ToString("yyyy-MM-ddTHH:mm:ssZ") `
        --aggregation Average | ConvertFrom-Json
    
    $avgCpu = ($cpuMetrics.value.timeseries.data | ForEach-Object { $_.average } | Measure-Object -Average).Average
    
    Write-Host "7-Day Average CPU Usage: $([math]::Round($avgCpu, 2))%"
    
    if ($avgCpu -lt 30) {
        Write-Warning "VM appears underutilized. Consider scaling down to save costs."
        Write-Host "Potential savings with E4s_v4: ~$180/month"
    } elseif ($avgCpu -gt 80) {
        Write-Warning "VM may be over-utilized. Consider scaling up for better performance."
    } else {
        Write-Host "VM utilization looks optimal." -ForegroundColor Green
    }
}

# Usage: Check-VMUsage -ResourceGroupName "RG-OPENSILEX-debian12" -VMName "phis-debian12"
```

### **8. Quick Reference Commands**

```bash
# Daily monitoring routine (run on VM)
echo "=== OpenSILEX Health Check $(date) ===" 
free -h                                    # Memory usage
df -h /home/opensilex                     # Disk usage  
docker ps                                 # Container status
systemctl status opensilex               # Service status
curl -f http://localhost:8666/api-docs >/dev/null && echo "✅ API responding" || echo "❌ API down"

# Weekly cost check (run locally)
az consumption usage list --start-date $(date -d '7 days ago' '+%Y-%m-%d') --end-date $(date '+%Y-%m-%d') --query "[?instanceName=='phis-debian12']" -o table
```

## 💡 **Best Practices**

1. **Monitor Weekly**: Check usage patterns every week
2. **Set Budgets**: Always have cost alerts configured  
3. **Use Spot Wisely**: Spot instances for dev/test, reserved for production
4. **Scale Gradually**: Make incremental size changes
5. **Document Changes**: Keep track of what works for your workload

## 📊 **Expected Usage Patterns**

```yaml
OpenSILEX Typical Resource Usage:
  CPU: 20-60% (spikes during data processing)
  Memory: 24-48GB (RDF4J is memory-intensive)
  Disk I/O: Moderate (database operations)
  Network: Low to moderate (API traffic)
  
Development vs Production:
  Development: Can use smaller VMs, spot instances
  Production: Need reliable, appropriately sized VMs
```

This guide will help you optimize costs while maintaining performance! 🚀
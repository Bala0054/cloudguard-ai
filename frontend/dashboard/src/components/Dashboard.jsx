import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL;

const mockCostData = [
  { date: "May 25", cost: 2.4, forecast: 2.8 },
  { date: "May 26", cost: 3.1, forecast: 3.0 },
  { date: "May 27", cost: 2.8, forecast: 3.1 },
  { date: "May 28", cost: 4.2, forecast: 3.5 },
  { date: "May 29", cost: 3.7, forecast: 3.8 },
  { date: "May 30", cost: 5.1, forecast: 4.2 },
  { date: "May 31", cost: 4.4, forecast: 4.5 },
  { date: "Jun 1",  cost: 3.9, forecast: 4.1 },
  { date: "Jun 2",  cost: 6.2, forecast: 4.8 },
  { date: "Jun 3",  cost: 5.8, forecast: 5.2 },
  { date: "Jun 4",  cost: 4.1, forecast: 4.9 },
];

const mockServices = [
  { service: "EC2",         cost: 14.20, change: "+12%" },
  { service: "S3",          cost: 3.40,  change: "-3%"  },
  { service: "Lambda",      cost: 0.02,  change: "+1%"  },
  { service: "API Gateway", cost: 1.80,  change: "+8%"  },
  { service: "DynamoDB",    cost: 0.80,  change: "+2%"  },
  { service: "CloudFront",  cost: 2.10,  change: "-1%"  },
];

const mockAlerts = [
  { id: 1, type: "COST_SPIKE",    severity: "HIGH",   message: "EC2 cost increased 38% vs last week",       time: "2h ago" },
  { id: 2, type: "ANOMALY",       severity: "MEDIUM", message: "Unusual API calls from ap-southeast-1",      time: "5h ago" },
  { id: 3, type: "IDLE_RESOURCE", severity: "LOW",    message: "3 EC2 instances running at <5% CPU for 7d", time: "1d ago" },
];

const CF_TEMPLATE = {
  AWSTemplateFormatVersion: "2010-09-09",
  Description: "CloudGuard AI - Read-only monitoring role",
  Resources: {
    CloudGuardRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "CloudGuardMonitoringRole",
        AssumeRolePolicyDocument: {
          Version: "2012-10-17",
          Statement: [{
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::656111643306:root" },
            Action: "sts:AssumeRole"
          }]
        },
        Policies: [{
          PolicyName: "CloudGuardReadOnly",
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [{
              Effect: "Allow",
              Action: [
                "ce:GetCostAndUsage",
                "iam:GetAccountPasswordPolicy",
                "iam:GetAccountSummary",
                "guardduty:ListDetectors",
                "cloudtrail:DescribeTrails",
                "cloudtrail:GetTrailStatus",
                "s3:GetAccountPublicAccessBlock",
                "securityhub:DescribeHub"
              ],
              Resource: "*"
            }]
          }
        }]
      }
    }
  },
  Outputs: {
    RoleArn: {
      Description: "Paste this ARN into CloudGuard",
      Value: { "Fn::GetAtt": ["CloudGuardRole", "Arn"] }
    }
  }
};

export default function Dashboard({ user, signOut }) {
  const [activeTab, setActiveTab]         = useState("overview");
  const [apiStatus, setApiStatus]         = useState("checking");
  const [costData, setCostData]           = useState(mockCostData);
  const [realCostData, setRealCostData]   = useState(null);
  const [realServices, setRealServices]   = useState(null);
  const [costLoading, setCostLoading]     = useState(false);
  const [costError, setCostError]         = useState(null);
  const [services]                        = useState(mockServices);
  const [alerts, setAlerts]               = useState(mockAlerts);
  const [securityData, setSecurityData]   = useState(null);
  const [roleArn, setRoleArn]             = useState("");
  const [connectStatus, setConnectStatus] = useState(null);
  const [connecting, setConnecting]       = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/anomalies`)
      .then(r => r.json())
      .then(data => {
        if (data.anomalies && data.anomalies.length > 0) {
          setAlerts(data.anomalies.map(a => ({
            id: a.day, type: "AI_ANOMALY",
            severity: a.severity, message: a.message, time: "just now"
          })));
          setApiStatus("live");
        }
      })
      .catch(() => setApiStatus("demo"));

    fetch(`${API_URL}/security`)
      .then(r => r.json())
      .then(data => setSecurityData(data))
      .catch(err => console.error("Security fetch failed:", err));

    // Phase 10: fetch real cost data
    setCostLoading(true);
    fetch(`${API_URL}/costs`)
      .then(r => r.json())
      .then(data => {
        if (data.data && data.data.length > 0) {
          // Build chart data from real API
          const chartData = data.data.slice(-14).map(day => ({
            date: day.date.slice(5),
            cost: day.total,
          }));
          setRealCostData(chartData);

          // Build service totals from last 30 days
          const serviceTotals = {};
          data.data.forEach(day => {
            Object.entries(day.services).forEach(([name, amount]) => {
              serviceTotals[name] = (serviceTotals[name] || 0) + amount;
            });
          });
          const serviceList = Object.entries(serviceTotals)
            .map(([service, cost]) => ({ service, cost: Math.round(cost * 100) / 100 }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 8);
          setRealServices(serviceList);
          setApiStatus("live");
        }
        setCostLoading(false);
      })
      .catch(() => {
        setCostError("Could not load real cost data");
        setCostLoading(false);
      });
  }, []);

  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(CF_TEMPLATE, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudguard-role.json";
    a.click();
  };

  const connectAccount = async () => {
    if (!roleArn.startsWith("arn:aws:iam::")) {
      setConnectStatus({ ok: false, msg: "Invalid ARN format. Should start with arn:aws:iam::" });
      return;
    }
    setConnecting(true);
    setConnectStatus(null);
    try {
      const res = await fetch(`${API_URL}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleArn, userEmail: user?.signInDetails?.loginId })
      });
      const data = await res.json();
      if (data.success) {
        setConnectStatus({ ok: true, msg: "AWS account connected! Refreshing data..." });
        setTimeout(() => setActiveTab("overview"), 2000);
      } else {
        setConnectStatus({ ok: false, msg: data.error || "Connection failed" });
      }
    } catch {
      setConnectStatus({ ok: false, msg: "Network error - check if dev server is running" });
    }
    setConnecting(false);
  };

  const displayCostData    = realCostData || costData;
  const displayServices    = realServices || services;
  const totalCost          = displayServices.reduce((s, r) => s + r.cost, 0).toFixed(2);
  const highAlerts         = alerts.filter(a => a.severity === "HIGH").length;
  const topService         = displayServices.length > 0 ? displayServices[0] : null;

  const panelStyle = { background: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", padding: "1.5rem", marginBottom: "1.5rem" };
  const stepBadge  = { display: "inline-block", background: "#1e40af", color: "#93c5fd", padding: "2px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" };
  const inputStyle = { width: "100%", background: "#0a1628", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem 1rem", color: "#e2e8f0", fontSize: "0.9rem", marginBottom: "1rem", boxSizing: "border-box" };
  const btnPrimary = { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.75rem 1.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" };
  const btnSecond  = { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem 1.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" };

  return (
    <div className="cg-shell">
      <aside className="cg-sidebar">
        <div className="cg-logo">CloudGuard</div>
        <nav className="cg-nav">
          {[
            { id: "overview",  label: "Overview",    icon: "O" },
            { id: "costs",     label: "Costs",       icon: "C" },
            { id: "security",  label: "Security",    icon: "S" },
            { id: "connect",   label: "Connect AWS", icon: "+" },
            { id: "settings",  label: "Settings",    icon: "=" },
          ].map(item => (
            <button
              key={item.id}
              className={`cg-nav-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
        <div className="cg-user-block">
          <div className="cg-user-email">{user?.signInDetails?.loginId}</div>
          <button className="cg-signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="cg-main">
        <div className="cg-header">
          <div>
            <h1 className="cg-title">
              {activeTab === "overview"  && "Dashboard Overview"}
              {activeTab === "costs"     && "Cost Analysis"}
              {activeTab === "security"  && "Security Scanner"}
              {activeTab === "connect"   && "Connect AWS Account"}
              {activeTab === "settings"  && "Settings"}
            </h1>
            <p className="cg-subtitle">
              AWS Account 656111643306 ap-south-1
              <span className={`cg-badge ${apiStatus}`}>
                {apiStatus === "live" ? "Live" : "Demo"}
              </span>
            </p>
          </div>
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <>
            <div className="cg-cards">
              {[
                { label: "30-Day Spend",  value: `$${totalCost}`,      sub: realCostData ? "Real AWS data" : "Demo data",  color: "#38bdf8" },
                { label: "Active Alerts", value: highAlerts,            sub: `${alerts.length} total`,                      color: "#f87171" },
                { label: "AWS Services",  value: displayServices.length, sub: "being monitored",                            color: "#a78bfa" },
                { label: "Est. Savings",  value: "$38",                 sub: "idle resources",                              color: "#34d399" },
              ].map((c, i) => (
                <div className="cg-card" key={i}>
                  <div className="cg-card-label">{c.label}</div>
                  <div className="cg-card-value" style={{ color: c.color }}>{c.value}</div>
                  <div className="cg-card-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div className="cg-panel">
              <div className="cg-panel-title">
                Daily Cost Trend
                {realCostData && <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", background: "#14532d", color: "#86efac", padding: "2px 8px", borderRadius: "999px" }}>Live</span>}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={displayCostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} formatter={v => [`$${v}`, ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="cost"     stroke="#38bdf8" strokeWidth={2} dot={false} name="Actual" />
                  {!realCostData && <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="5 5" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="cg-bottom">
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Service Breakdown</div>
                <table className="cg-table">
                  <thead><tr><th>Service</th><th>30d Cost</th></tr></thead>
                  <tbody>
                    {displayServices.map((s, i) => (
                      <tr key={i}>
                        <td>{s.service}</td>
                        <td>${s.cost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Active Alerts</div>
                <div className="cg-alerts">
                  {alerts.map(a => (
                    <div className="cg-alert" key={a.id}>
                      <div className={`cg-severity ${a.severity.toLowerCase()}`}>{a.severity}</div>
                      <div className="cg-alert-body">
                        <div className="cg-alert-msg">{a.message}</div>
                        <div className="cg-alert-time">{a.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* COSTS TAB */}
        {activeTab === "costs" && (
          <>
            {costLoading && (
              <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
                Loading real AWS cost data...
              </div>
            )}
            {costError && (
              <div style={{ padding: "1rem", background: "#450a0a", color: "#fca5a5", borderRadius: "8px", marginBottom: "1rem" }}>
                {costError} - showing demo data
              </div>
            )}
            {realCostData && (
              <div style={{ padding: "0.75rem 1rem", background: "#14532d", color: "#86efac", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.875rem" }}>
                Showing real AWS Cost Explorer data for your account
              </div>
            )}
            <div className="cg-bottom" style={{ marginBottom: "1rem" }}>
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Service Breakdown (30d)</div>
                <table className="cg-table">
                  <thead><tr><th>Service</th><th>Cost</th></tr></thead>
                  <tbody>
                    {displayServices.map((s, i) => (
                      <tr key={i}>
                        <td>{s.service}</td>
                        <td>${s.cost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Cost Summary</div>
                {[
                  { label: "Total 30d Spend",  value: `$${totalCost}` },
                  { label: "Highest Service",  value: topService ? `${topService.service} - $${topService.cost.toFixed(4)}` : "-" },
                  { label: "Data Source",      value: realCostData ? "AWS Cost Explorer" : "Demo" },
                  { label: "Period",           value: "Last 30 days" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid #1e293b", fontSize: "0.875rem" }}>
                    <span style={{ color: "#64748b" }}>{r.label}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="cg-panel">
              <div className="cg-panel-title">
                Daily Cost Trend (Last 14 Days)
                {realCostData && <span style={{ marginLeft: "0.75rem", fontSize: "0.75rem", background: "#14532d", color: "#86efac", padding: "2px 8px", borderRadius: "999px" }}>Live</span>}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={displayCostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} formatter={v => [`$${v}`, "Cost"]} />
                  <Bar dataKey="cost" fill="#38bdf8" radius={[4, 4, 0, 0]} name="Daily Cost" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* SECURITY TAB */}
        {activeTab === "security" && (
          securityData ? (
            <div className="cg-panel">
              <div className="cg-panel-title">Security Score</div>
              <div style={{ fontSize: "3rem", fontWeight: 700, color: securityData.score < 50 ? "#f87171" : "#34d399", marginBottom: "0.5rem" }}>
                {securityData.score}/100
              </div>
              <div style={{ color: "#64748b", marginBottom: "1.5rem" }}>{securityData.passed} of {securityData.total} checks passed</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {securityData.checks && securityData.checks.map(check => (
                  <div key={check.id} style={{ display: "flex", gap: "1rem", alignItems: "flex-start", padding: "0.75rem", borderRadius: "8px", background: "#0a1628", border: `1px solid ${check.status === "PASS" ? "#166534" : "#7f1d1d"}` }}>
                    <div style={{ fontSize: "1.2rem" }}>{check.status === "PASS" ? "PASS" : "FAIL"}</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem" }}>{check.name}</div>
                      <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "2px" }}>{check.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Loading security data...</div>
          )
        )}

        {/* CONNECT AWS TAB */}
        {activeTab === "connect" && (
          <div style={panelStyle}>
            <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
              Connect any AWS account to CloudGuard in 3 steps. We only request <strong style={{ color: "#38bdf8" }}>read-only</strong> permissions.
            </p>
            <div style={{ marginBottom: "2rem", padding: "1.25rem", background: "#0a1628", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={stepBadge}>Step 1</div>
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>Download the CloudFormation Template</div>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                This template creates a secure IAM Role in your AWS account that allows CloudGuard to read your cost and security data.
              </p>
              <button onClick={downloadTemplate} style={btnSecond}>Download cloudguard-role.json</button>
            </div>
            <div style={{ marginBottom: "2rem", padding: "1.25rem", background: "#0a1628", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={stepBadge}>Step 2</div>
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>Run It In Your AWS Account</div>
              <ol style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 2, paddingLeft: "1.25rem", margin: 0 }}>
                <li>Go to AWS Console - CloudFormation - Create Stack</li>
                <li>Choose Upload a template file</li>
                <li>Upload the cloudguard-role.json file</li>
                <li>Click Next - Next - Create Stack</li>
                <li>Go to the Outputs tab and copy the RoleArn value</li>
              </ol>
            </div>
            <div style={{ padding: "1.25rem", background: "#0a1628", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={stepBadge}>Step 3</div>
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>Paste Your Role ARN</div>
              <input
                style={inputStyle}
                placeholder="arn:aws:iam::123456789012:role/CloudGuardMonitoringRole"
                value={roleArn}
                onChange={e => setRoleArn(e.target.value)}
              />
              <button onClick={connectAccount} disabled={connecting} style={{ ...btnPrimary, opacity: connecting ? 0.6 : 1 }}>
                {connecting ? "Connecting..." : "Connect AWS Account"}
              </button>
              {connectStatus && (
                <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: connectStatus.ok ? "#14532d" : "#450a0a", color: connectStatus.ok ? "#86efac" : "#fca5a5", fontSize: "0.875rem" }}>
                  {connectStatus.msg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div style={panelStyle}>
            <div style={{ color: "#64748b", fontSize: "0.875rem" }}>Settings coming soon.</div>
          </div>
        )}

      </main>
    </div>
  );
}
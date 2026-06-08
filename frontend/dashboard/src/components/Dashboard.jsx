import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
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
  Description: "CloudGuard AI ΓÇö Read-only monitoring role",
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
  const [activeTab, setActiveTab]       = useState("overview");
  const [apiStatus, setApiStatus]       = useState("checking");
  const [costData]                      = useState(mockCostData);
  const [services]                      = useState(mockServices);
  const [alerts, setAlerts]             = useState(mockAlerts);
  const [securityData, setSecurityData] = useState(null);
  const [roleArn, setRoleArn]           = useState("");
  const [connectStatus, setConnectStatus] = useState(null);
  const [connecting, setConnecting]     = useState(false);

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

    // Phase 10: Real Cost Explorer data
    fetch(`${API_URL}/costs`)
      .then(r => r.json())
      .then(data => {
        if (data.data && data.data.length > 0) {
          const chartData = data.data.slice(-14).map(day => ({
            date: day.date.slice(5),
            cost: day.total,
          }));
          setRealCostData(chartData);
          const totals = {};
          data.data.forEach(day => {
            Object.entries(day.services).forEach(([k, v]) => {
              totals[k] = (totals[k] || 0) + v;
            });
          });
          setRealServices(
            Object.entries(totals)
              .map(([service, cost]) => ({ service, cost: Math.round(cost * 10000) / 10000 }))
              .sort((a, b) => b.cost - a.cost)
              .slice(0, 8)
          );
          setApiStatus("live");
        }
      })
      .catch(() => {});
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
        body: JSON.stringify({
          roleArn,
          userEmail: user?.signInDetails?.loginId
        })
      });
      const data = await res.json();
      if (data.success) {
        setConnectStatus({ ok: true, msg: "Γ£à AWS account connected! Refreshing data..." });
        setTimeout(() => setActiveTab("overview"), 2000);
      } else {
        setConnectStatus({ ok: false, msg: data.error || "Connection failed" });
      }
    } catch {
      setConnectStatus({ ok: false, msg: "Network error ΓÇö check if dev server is running" });
    }
    setConnecting(false);
  };

  const totalCost  = services.reduce((s, r) => s + r.cost, 0).toFixed(2);
  const highAlerts = alerts.filter(a => a.severity === "HIGH").length;

  const panelStyle = { background: "#0f172a", borderRadius: "12px", border: "1px solid #1e293b", padding: "1.5rem", marginBottom: "1.5rem" };
  const stepBadge  = { display: "inline-block", background: "#1e40af", color: "#93c5fd", padding: "2px 10px", borderRadius: "999px", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem" };
  const inputStyle = { width: "100%", background: "#0a1628", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem 1rem", color: "#e2e8f0", fontSize: "0.9rem", marginBottom: "1rem", boxSizing: "border-box" };
  const btnPrimary = { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", padding: "0.75rem 1.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" };
  const btnSecond  = { background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem 1.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" };

  return (
    <div className="cg-shell">
      <aside className="cg-sidebar">
        <div className="cg-logo">≡ƒ¢í∩╕Å CloudGuard</div>
        <nav className="cg-nav">
          {[
            { id: "overview",  label: "Overview",  icon: "" },
            { id: "costs",     label: "Costs",     icon: "" },
            { id: "security",  label: "Security",  icon: "" },
            { id: "connect",   label: "Connect AWS", icon: "" },
            { id: "settings",  label: "Settings",  icon: "" },
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
              AWS Account 656111643306 ┬╖ ap-south-1 ┬╖{" "}
              <span className={`cg-badge ${apiStatus}`}>
                {apiStatus === "live" ? "≡ƒƒó Live" : "≡ƒƒí Demo"}
              </span>
            </p>
          </div>
        </div>

        {/* ΓöÇΓöÇ OVERVIEW TAB ΓöÇΓöÇ */}
        {activeTab === "overview" && (
          <>
            <div className="cg-cards">
              {[
                { label: "30-Day Spend",  value: `$${totalCost}`, sub: "Γåæ 14% vs last month", color: "#38bdf8" },
                { label: "Active Alerts", value: highAlerts,       sub: `${alerts.length} total`, color: "#f87171" },
                { label: "AWS Services",  value: services.length,  sub: "being monitored",      color: "#a78bfa" },
                { label: "Est. Savings",  value: "$38",            sub: "idle resources",       color: "#34d399" },
              ].map((c, i) => (
                <div className="cg-card" key={i}>
                  <div className="cg-card-label">{c.label}</div>
                  <div className="cg-card-value" style={{ color: c.color }}>{c.value}</div>
                  <div className="cg-card-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div className="cg-panel">
              <div className="cg-panel-title">Daily Cost Trend (Last 11 Days)</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={displayCostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} formatter={v => [`$${v}`, ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="cost"     stroke="#38bdf8" strokeWidth={2} dot={false} name="Actual" />
                  <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="cg-bottom">
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Service Breakdown</div>
                <table className="cg-table">
                  <thead><tr><th>Service</th><th>30d Cost</th><th>Change</th></tr></thead>
                  <tbody>
                    {services.map((s, i) => (
                      <tr key={i}>
                        <td>{s.service}</td>
                        <td>${s.cost.toFixed(2)}</td>
                        <td style={{ color: s.change.startsWith("+") ? "#f87171" : "#34d399" }}>{s.change}</td>
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

        {/* ΓöÇΓöÇ COSTS TAB ΓöÇΓöÇ */}
        {activeTab === "costs" && (
          <>
            <div className="cg-bottom" style={{ marginBottom: "1rem" }}>
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Service Breakdown</div>
                <table className="cg-table">
                  <thead><tr><th>Service</th><th>30d Cost</th><th>Change</th></tr></thead>
                  <tbody>
                    {services.map((s, i) => (
                      <tr key={i}>
                        <td>{s.service}</td>
                        <td>${s.cost.toFixed(2)}</td>
                        <td style={{ color: s.change.startsWith("+") ? "#f87171" : "#34d399" }}>{s.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="cg-panel cg-panel-half">
                <div className="cg-panel-title">Cost Summary</div>
                {[
                  { label: "Total 30d Spend",   value: `$${totalCost}` },
                  { label: "Highest Service",   value: "EC2 ΓÇö $14.20"  },
                  { label: "Estimated Savings", value: "$38.00"         },
                  { label: "Forecast (30d)",    value: "$28.50"         },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid #1e293b", fontSize: "0.875rem" }}>
                    <span style={{ color: "#64748b" }}>{r.label}</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="cg-panel">
              <div className="cg-panel-title">Daily Cost Trend (Last 11 Days)</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={displayCostData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} labelStyle={{ color: "#e2e8f0" }} formatter={v => [`$${v}`, ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="cost"     stroke="#38bdf8" strokeWidth={2} dot={false} name="Actual" />
                  <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ΓöÇΓöÇ SECURITY TAB ΓöÇΓöÇ */}
        {activeTab === "security" && (
          securityData ? (
            <div className="cg-panel">
              <div className="cg-panel-title">Security Score</div>
              <div style={{ fontSize: "3rem", fontWeight: 700, color: securityData.score < 50 ? "#f87171" : "#34d399", marginBottom: "0.5rem" }}>
                {securityData.score}/100
              </div>
              <div style={{ color: "#64748b", marginBottom: "1.5rem" }}>{securityData.passed} of {securityData.total} checks passed</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {securityData.checks.map(check => (
                  <div key={check.id} style={{ display: "flex", gap: "1rem", alignItems: "flex-start", padding: "0.75rem", borderRadius: "8px", background: "#0a1628", border: `1px solid ${check.status === "PASS" ? "#166534" : "#7f1d1d"}` }}>
                    <div style={{ fontSize: "1.2rem" }}>{check.status === "PASS" ? "Γ£à" : "Γ¥î"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{check.title}</span>
                        <span style={{ padding: "1px 6px", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, background: check.severity === "CRITICAL" ? "#450a0a" : check.severity === "HIGH" ? "#431407" : "#2d1f00", color: check.severity === "CRITICAL" ? "#f87171" : check.severity === "HIGH" ? "#fb923c" : "#fbbf24" }}>{check.severity}</span>
                      </div>
                      <div style={{ fontSize: "0.83rem", color: "#94a3b8" }}>{check.message}</div>
                      {check.status === "FAIL" && <div style={{ fontSize: "0.78rem", color: "#38bdf8", marginTop: "4px" }}>≡ƒÆí {check.recommendation}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="cg-panel" style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>ΓÅ│ Loading security data...</div>
          )
        )}

        {/* ΓöÇΓöÇ CONNECT AWS TAB ΓöÇΓöÇ */}
        {activeTab === "connect" && (
          <div style={panelStyle}>
            <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
              Connect any AWS account to CloudGuard in 3 steps. We only request <strong style={{ color: "#38bdf8" }}>read-only</strong> permissions ΓÇö CloudGuard never modifies your infrastructure.
            </p>

            {/* Step 1 */}
            <div style={{ marginBottom: "2rem", padding: "1.25rem", background: "#0a1628", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={stepBadge}>Step 1</div>
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>Download the CloudFormation Template</div>
              <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: "1rem", lineHeight: 1.6 }}>
                This template creates a secure IAM Role in your AWS account that allows CloudGuard to read your cost and security data.
              </p>
              <button onClick={downloadTemplate} style={btnSecond}>Γ¼ç∩╕Å Download cloudguard-role.json</button>
            </div>

            {/* Step 2 */}
            <div style={{ marginBottom: "2rem", padding: "1.25rem", background: "#0a1628", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={stepBadge}>Step 2</div>
              <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "1rem", marginBottom: "0.5rem" }}>Run It In Your AWS Account</div>
              <ol style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 2, paddingLeft: "1.25rem", margin: 0 }}>
                <li>Go to <strong style={{ color: "#38bdf8" }}>AWS Console ΓåÆ CloudFormation ΓåÆ Create Stack</strong></li>
                <li>Choose <strong style={{ color: "#38bdf8" }}>Upload a template file</strong></li>
                <li>Upload the <code style={{ background: "#1e293b", padding: "1px 6px", borderRadius: "4px" }}>cloudguard-role.json</code> file</li>
                <li>Click Next ΓåÆ Next ΓåÆ Create Stack</li>
                <li>Wait ~1 minute for it to complete</li>
                <li>Go to the <strong style={{ color: "#38bdf8" }}>Outputs</strong> tab and copy the <code style={{ background: "#1e293b", padding: "1px 6px", borderRadius: "4px" }}>RoleArn</code> value</li>
              </ol>
            </div>

            {/* Step 3 */}
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
                {connecting ? "ΓÅ│ Connecting..." : "≡ƒöù Connect AWS Account"}
              </button>
              {connectStatus && (
                <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", borderRadius: "8px", background: connectStatus.ok ? "#14532d" : "#450a0a", color: connectStatus.ok ? "#86efac" : "#fca5a5", fontSize: "0.875rem" }}>
                  {connectStatus.msg}
                </div>
              )}
            </div>

            {/* Info box */}
            <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#0c1a2e", borderRadius: "8px", border: "1px solid #1e3a5f" }}>
              <div style={{ color: "#38bdf8", fontWeight: 600, marginBottom: "0.5rem" }}>≡ƒöÉ Security Note</div>
              <div style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.6 }}>
                CloudGuard uses AWS STS AssumeRole ΓÇö we never store your AWS access keys. The IAM role grants read-only access only to billing and security APIs. You can delete the CloudFormation stack at any time to immediately revoke all access.
              </div>
            </div>
          </div>
        )}

        {/* ΓöÇΓöÇ SETTINGS TAB ΓöÇΓöÇ */}
        {activeTab === "settings" && (
          <div className="cg-panel">
            <div className="cg-panel-title">Settings</div>
            {[
              { label: "AWS Account ID",  value: "656111643306" },
              { label: "Region",          value: "ap-south-1" },
              { label: "User Pool ID",    value: "ap-south-1_foQ3Jk4cx" },
              { label: "API Endpoint",    value: "o2nvgd1ydl.execute-api.ap-south-1.amazonaws.com" },
              { label: "DynamoDB Table",  value: "cloudguard-main" },
              { label: "App Version",     value: "2.0.0" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid #1e293b", fontSize: "0.875rem" }}>
                <span style={{ color: "#64748b" }}>{r.label}</span>
                <span style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "monospace", fontSize: "0.8rem" }}>{r.value}</span>
              </div>
            ))}
            <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#0a1628", borderRadius: "8px", border: "1px solid #1e293b" }}>
              <div style={{ color: "#38bdf8", fontWeight: 600, marginBottom: "0.5rem" }}>Logged in as</div>
              <div style={{ color: "#94a3b8", fontSize: "0.875rem" }}>{user?.signInDetails?.loginId}</div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

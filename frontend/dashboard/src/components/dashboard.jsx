import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";

const API_URL = "https://o2nvgd1ydl.execute-api.ap-south-1.amazonaws.com/prod";

// Mock cost data for demo (real data comes from API)
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
  { service: "EC2",            cost: 14.20, change: "+12%" },
  { service: "S3",             cost: 3.40,  change: "-3%"  },
  { service: "Lambda",         cost: 0.02,  change: "+1%"  },
  { service: "API Gateway",    cost: 1.80,  change: "+8%"  },
  { service: "DynamoDB",       cost: 0.80,  change: "+2%"  },
  { service: "CloudFront",     cost: 2.10,  change: "-1%"  },
];

const mockAlerts = [
  { id: 1, type: "COST_SPIKE",   severity: "HIGH",   message: "EC2 cost increased 38% vs last week",        time: "2h ago"  },
  { id: 2, type: "ANOMALY",      severity: "MEDIUM", message: "Unusual API calls from ap-southeast-1",       time: "5h ago"  },
  { id: 3, type: "IDLE_RESOURCE",severity: "LOW",    message: "3 EC2 instances running at <5% CPU for 7d",  time: "1d ago"  },
];

export default function Dashboard({ user, signOut }) {
  const [activeTab, setActiveTab]   = useState("overview");
  const [apiStatus, setApiStatus]   = useState("checking");
  const [costData]                  = useState(mockCostData);
  const [services]                  = useState(mockServices);
  const [alerts]                    = useState(mockAlerts);

  useEffect(() => {
    fetch(`${API_URL}/costs`)
      .then(r => r.json())
      .then(() => setApiStatus("live"))
      .catch(() => setApiStatus("demo"));
  }, []);

  const totalCost   = services.reduce((s, r) => s + r.cost, 0).toFixed(2);
  const highAlerts  = alerts.filter(a => a.severity === "HIGH").length;

  return (
    <div className="cg-shell">
      {/* ── SIDEBAR ── */}
      <aside className="cg-sidebar">
        <div className="cg-logo">🛡️ CloudGuard</div>
        <nav className="cg-nav">
          {[
            { id: "overview",  label: "Overview",  icon: "📊" },
            { id: "costs",     label: "Costs",     icon: "💰" },
            { id: "security",  label: "Security",  icon: "🔒" },
            { id: "settings",  label: "Settings",  icon: "⚙️" },
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

      {/* ── MAIN CONTENT ── */}
      <main className="cg-main">
        {/* Header */}
        <div className="cg-header">
          <div>
            <h1 className="cg-title">Dashboard Overview</h1>
            <p className="cg-subtitle">
              AWS Account 656111643306 · ap-south-1 ·{" "}
              <span className={`cg-badge ${apiStatus}`}>
                {apiStatus === "live" ? "🟢 Live" : "🟡 Demo"}
              </span>
            </p>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="cg-cards">
          {[
            { label: "30-Day Spend",   value: `$${totalCost}`, sub: "↑ 14% vs last month", color: "#38bdf8" },
            { label: "Active Alerts",  value: highAlerts,       sub: `${alerts.length} total`, color: "#f87171"  },
            { label: "AWS Services",   value: services.length,  sub: "being monitored",      color: "#a78bfa"  },
            { label: "Est. Savings",   value: "$38",            sub: "idle resources",       color: "#34d399"  },
          ].map((c, i) => (
            <div className="cg-card" key={i}>
              <div className="cg-card-label">{c.label}</div>
              <div className="cg-card-value" style={{ color: c.color }}>{c.value}</div>
              <div className="cg-card-sub">{c.sub}</div>
            </div>
          ))}
        </div>

        {/* ── COST CHART ── */}
        <div className="cg-panel">
          <div className="cg-panel-title">Daily Cost Trend (Last 11 Days)</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={costData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
                formatter={v => [`$${v}`, ""]}
              />
              <Legend />
              <Line type="monotone" dataKey="cost"     stroke="#38bdf8" strokeWidth={2} dot={false} name="Actual"   />
              <Line type="monotone" dataKey="forecast" stroke="#a78bfa" strokeWidth={2} dot={false} name="Forecast" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ── BOTTOM ROW ── */}
        <div className="cg-bottom">
          {/* Service breakdown */}
          <div className="cg-panel cg-panel-half">
            <div className="cg-panel-title">Service Breakdown</div>
            <table className="cg-table">
              <thead>
                <tr><th>Service</th><th>30d Cost</th><th>Change</th></tr>
              </thead>
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

          {/* Alerts */}
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
      </main>
    </div>
  );
}
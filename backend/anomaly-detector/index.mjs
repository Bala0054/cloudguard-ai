export const handler = async (event) => {
  // Sample cost data (in real version this comes from DynamoDB)
  const costs = [2.4, 3.1, 2.8, 4.2, 3.7, 5.1, 4.4, 3.9, 6.2, 5.8, 4.1];

  // Z-score anomaly detection
  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  const std = Math.sqrt(costs.map(x => (x - mean) ** 2).reduce((a, b) => a + b, 0) / costs.length);

  const anomalies = costs
    .map((cost, i) => ({ day: i + 1, cost, zScore: Math.abs((cost - mean) / std) }))
    .filter(d => d.zScore > 1.5)
    .map(d => ({
      day: d.day,
      cost: d.cost,
      severity: d.zScore > 2 ? "HIGH" : "MEDIUM",
      message: `Day ${d.day} cost $${d.cost} is abnormal (${d.zScore.toFixed(2)}σ from mean)`
    }));

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ mean: mean.toFixed(2), std: std.toFixed(2), anomalies })
  };
};
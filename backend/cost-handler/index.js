const { CostExplorerClient, GetCostAndUsageCommand } = require("@aws-sdk/client-cost-explorer");
const client = new CostExplorerClient({ region: "us-east-1" });

exports.handler = async (event) => {
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  const formatDate = (d) => d.toISOString().split("T")[0];

  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: formatDate(thirtyDaysAgo),
      End: formatDate(today),
    },
    Granularity: "DAILY",
    Metrics: ["UnblendedCost"],
    GroupBy: [
      {
        Type: "DIMENSION",
        Key: "SERVICE",
      },
    ],
  });

  try {
    const response = await client.send(command);

    const parsed = response.ResultsByTime.map((day) => {
      const services = {};
      day.Groups.forEach((group) => {
        const name = group.Keys[0];
        const amount = parseFloat(group.Metrics.UnblendedCost.Amount);
        if (amount > 0) services[name] = Math.round(amount * 10000) / 10000;
      });
      return {
        date: day.TimePeriod.Start,
        services,
        total: Math.round(Object.values(services).reduce((a, b) => a + b, 0) * 10000) / 10000,
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        period: {
          start: formatDate(thirtyDaysAgo),
          end: formatDate(today),
        },
        data: parsed,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
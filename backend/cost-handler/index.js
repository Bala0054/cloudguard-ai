const { CostExplorerClient, GetCostAndUsageCommand } = require("@aws-sdk/client-cost-explorer");

const client = new CostExplorerClient({ region: "us-east-1" });

exports.handler = async (event) => {

  // Get today and 30 days ago
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
        Key: "SERVICE",  // breaks down cost per AWS service
      },
    ],
  });

  try {
    const response = await client.send(command);

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        message: "Cost data fetched successfully",
        data: response.ResultsByTime,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
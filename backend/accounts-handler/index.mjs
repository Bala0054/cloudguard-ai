import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const sts = new STSClient({ region: "ap-south-1" });
const db  = new DynamoDBClient({ region: "ap-south-1" });

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { roleArn, userEmail } = JSON.parse(event.body || "{}");

    // Validate inputs
    if (!roleArn || !userEmail) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "roleArn and userEmail are required" })
      };
    }

    if (!roleArn.startsWith("arn:aws:iam::")) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: "Invalid ARN format" })
      };
    }

    // Test the role by assuming it — this proves it works
    const assumeResult = await sts.send(new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "CloudGuardValidation",
      DurationSeconds: 900
    }));

    if (!assumeResult.Credentials) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ success: false, error: "Could not assume role — check trust policy" })
      };
    }

    // Extract account ID from the ARN
    // arn:aws:iam::123456789012:role/CloudGuardMonitoringRole
    const accountId = roleArn.split(":")[4];

    // Store in DynamoDB
    await db.send(new PutItemCommand({
      TableName: "cloudguard-main",
      Item: {
        tenantId: { S: userEmail },
        recordId: { S: "AWS_ACCOUNT" },
        accountId: { S: accountId },
        roleArn:   { S: roleArn },
        connectedAt: { S: new Date().toISOString() },
        status: { S: "ACTIVE" }
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accountId,
        message: `Successfully connected AWS account ${accountId}`
      })
    };

  } catch (err) {
    console.error("Connection error:", err);

    // Give helpful error messages
    let errorMsg = "Connection failed";
    if (err.name === "AccessDenied") {
      errorMsg = "Access denied — make sure the trust policy includes arn:aws:iam::656111643306:root";
    } else if (err.name === "NoSuchEntity") {
      errorMsg = "Role not found — check the ARN is correct";
    } else if (err.message) {
      errorMsg = err.message;
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: errorMsg })
    };
  }
};
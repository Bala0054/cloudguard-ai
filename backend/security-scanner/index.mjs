export const handler = async () => {
  const checks = [
    {
      id: "CG-001",
      title: "Root account MFA",
      severity: "CRITICAL",
      status: "FAIL",
      message: "Root account does not have MFA enabled",
      recommendation: "Enable MFA on the root account immediately"
    },
    {
      id: "CG-002", 
      title: "S3 public access block",
      severity: "HIGH",
      status: "PASS",
      message: "S3 Block Public Access is enabled at account level",
      recommendation: "No action needed"
    },
    {
      id: "CG-003",
      title: "CloudTrail logging",
      severity: "HIGH",
      status: "FAIL",
      message: "CloudTrail is not enabled in ap-south-1",
      recommendation: "Enable CloudTrail for audit logging"
    },
    {
      id: "CG-004",
      title: "IAM password policy",
      severity: "MEDIUM",
      status: "PASS",
      message: "Strong password policy is configured",
      recommendation: "No action needed"
    },
    {
      id: "CG-005",
      title: "Security Hub enabled",
      severity: "MEDIUM",
      status: "FAIL",
      message: "AWS Security Hub is not enabled",
      recommendation: "Enable Security Hub for centralized security findings"
    },
    {
      id: "CG-006",
      title: "GuardDuty enabled",
      severity: "HIGH",
      status: "FAIL",
      message: "Amazon GuardDuty is not enabled",
      recommendation: "Enable GuardDuty for threat detection"
    },
  ];

  const passed = checks.filter(c => c.status === "PASS").length;
  const score  = Math.round((passed / checks.length) * 100);

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ score, passed, total: checks.length, checks })
  };
};
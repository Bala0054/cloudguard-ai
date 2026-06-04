# 🛡️ CloudGuard AI

> AI-powered AWS cloud cost monitoring and security scanning platform

**Live Demo:** https://di2uscgfcvx6x.cloudfront.net

---

## What It Does

CloudGuard AI continuously monitors your AWS account for cost anomalies and
security misconfigurations, giving you real-time alerts and a security score
— all in a clean, modern dashboard.

- 🤖 **AI Anomaly Detection** — Z-score algorithm flags unusual cost spikes
- 🔒 **Security Scanner** — checks 6 critical AWS security controls
- 💰 **Cost Dashboard** — tracks daily spend with forecasting
- 🔐 **Secure Auth** — AWS Cognito login with email verification

---

## Live Architecture

```
User → CloudFront → S3 (React App)
                 ↘ API Gateway → Lambda (Anomaly Detector)
                              → Lambda (Security Scanner)
                              → Lambda (Cost Handler) → DynamoDB
Cognito handles authentication
```
---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Recharts, AWS Amplify UI |
| Auth | AWS Cognito (email + password) |
| API | AWS API Gateway (REST) |
| Backend | AWS Lambda (Node.js 18) |
| Database | AWS DynamoDB |
| Hosting | AWS S3 + CloudFront |
| IaC | AWS CDK (TypeScript) |
| AI | Z-score statistical anomaly detection |

---

## Features

### AI Anomaly Detection
Analyzes daily cost data using Z-score statistics. Any day where spend
is more than 1.5 standard deviations from the mean is flagged as an
anomaly with severity rating (MEDIUM/HIGH).

### Security Scanner
Runs 6 automated checks against AWS best practices:
- Root account MFA status
- S3 Block Public Access
- CloudTrail logging
- IAM password policy
- AWS Security Hub
- Amazon GuardDuty

Returns a 0-100 security score with actionable recommendations.

### Cost Dashboard
- 11-day cost trend with actual vs forecast line chart
- Per-service cost breakdown with week-over-week change
- Real-time alert panel fed by AI anomaly detection

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/Bala0054/cloudguard-ai.git
cd cloudguard-ai

# Start frontend
cd frontend/dashboard
npm install
npm run dev

# Deploy infrastructure (requires AWS CLI configured)
cd ../../infrastructure
npm install
npx cdk deploy
```

---

## Project Structure

```
cloudguard-ai/
├── backend/
│   ├── cost-handler/        # Cost data Lambda
│   ├── anomaly-detector/    # AI anomaly detection Lambda
│   └── security-scanner/    # Security checks Lambda
├── frontend/
│   └── dashboard/           # React + Vite app
├── infrastructure/
│   └── lib/
│       └── infrastructure-stack.ts
└── README.md
```
---

## AWS Services Used

- **CloudFront** — CDN for global frontend delivery
- **S3** — Static site hosting
- **API Gateway** — REST API with CORS
- **Lambda** — Serverless compute (3 functions)
- **DynamoDB** — NoSQL database
- **Cognito** — User authentication
- **CDK** — Infrastructure as Code

---

## Author

Built by Bala — https://github.com/Bala0054
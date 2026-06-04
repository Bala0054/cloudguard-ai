import { Authenticator } from "@aws-amplify/ui-react";
import { Amplify } from "aws-amplify";
import "@aws-amplify/ui-react/styles.css";
import awsConfig from "./aws-exports";
import Dashboard from "./components/Dashboard";

Amplify.configure(awsConfig);

export default function App() {
  return (
    <Authenticator loginMechanisms={["email"]}>
      {({ signOut, user }) => (
        <Dashboard user={user} signOut={signOut} />
      )}
    </Authenticator>
  );
}
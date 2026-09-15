import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";

export default function NonWinnerEmail({ orgName, date }: { orgName: string; date: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your lottery result from {orgName}</Preview>
      <Body style={{ fontFamily: "Arial, sans-serif", color: "#171717" }}>
        <Container style={{ padding: "24px", maxWidth: "560px" }}>
          <Heading>{orgName} — Lottery result</Heading>
          <Text>The draw for {date} has been completed. You were not selected this time.</Text>
          <Text>No additional action is required. Thank you for participating.</Text>
        </Container>
      </Body>
    </Html>
  );
}

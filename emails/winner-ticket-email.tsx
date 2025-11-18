import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

interface WinnerTicketEmailProps {
  name: string;
  ticketNumber: number;
  ticketId: string;
  date: string;
  pickupTime: string;
}

export default function WinnerTicketEmail({
  name = "Winner",
  ticketNumber = 1,
  ticketId = "123456",
  date = "2024-01-01",
  pickupTime = "5:30 PM",
}: WinnerTicketEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Congratulations! You won the Canmore Food Recovery lottery!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Congratulations, {name}!</Heading>

          <Text style={text}>
            You've been selected as a winner in today's Canmore Food Recovery lottery!
          </Text>

          <Section style={ticketSection}>
            <Heading as="h2" style={h2}>Your Ticket Information</Heading>
            <Text style={ticketInfo}>
              <strong>Ticket Number:</strong> #{ticketNumber}
            </Text>
            <Text style={ticketInfo}>
              <strong>Ticket ID:</strong> {ticketId}
            </Text>
            <Text style={ticketInfo}>
              <strong>Date:</strong> {date}
            </Text>
            <Text style={ticketInfo}>
              <strong>Pickup Time:</strong> {pickupTime}
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={instructionsSection}>
            <Heading as="h3" style={h3}>Next Steps</Heading>
            <Text style={text}>
              Please bring this email or your Ticket ID (<strong>{ticketId}</strong>) when you come to pick up your food.
            </Text>
            <Text style={text}>
              <strong>Pickup Location:</strong> Canmore Food Recovery Center
            </Text>
            <Text style={text}>
              <strong>Pickup Time:</strong> {pickupTime}
            </Text>
            <Text style={text}>
              If you cannot make it to the pickup, please let us know as soon as possible so we can offer your spot to someone else.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Thank you for supporting Canmore Food Recovery!
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
  borderRadius: "8px",
};

const h1 = {
  color: "#16a34a",
  fontSize: "32px",
  fontWeight: "bold",
  margin: "40px 0 20px",
  padding: "0 40px",
  lineHeight: "1.3",
};

const h2 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "600",
  margin: "20px 0 15px",
};

const h3 = {
  color: "#333",
  fontSize: "20px",
  fontWeight: "600",
  margin: "20px 0 15px",
};

const text = {
  color: "#525252",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "16px 0",
  padding: "0 40px",
};

const ticketSection = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  padding: "24px 40px",
  margin: "24px 40px",
  border: "2px solid #16a34a",
};

const ticketInfo = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "1.8",
  margin: "8px 0",
  padding: "0",
};

const instructionsSection = {
  padding: "0 40px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "32px 0",
};

const footer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "32px 0 0",
  padding: "0 40px",
  textAlign: "center" as const,
};

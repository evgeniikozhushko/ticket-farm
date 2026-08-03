import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

interface WinnerTicketEmailProps {
  name: string;
  ticketNumber: number;
  ticketId: string;
  date: string;
  pickupTime: string;
  orgName: string;
  pickupLocation?: string;
}

export default function WinnerTicketEmail({
  name = "Winner",
  ticketNumber = 1,
  ticketId = "123456",
  date = "2024-01-01",
  pickupTime = "5:30 PM",
  orgName = "Ticket Farm",
  pickupLocation,
}: WinnerTicketEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <style>{responsiveStyles}</style>
      </Head>

      <Preview>
        {`Your ticket #${ticketNumber} from ${orgName} is ready.`}
      </Preview>

      <Body style={main}>
        <Container className="email-container" style={container}>
          <Section className="email-header" style={header}>
            <Text style={organizationName}>{orgName}</Text>

            <Heading className="email-heading" style={h1}>Ticket is ready</Heading>

            <Text className="email-introduction" style={introduction}>
              Congratulations, {name}. You have been selected for a ticket from{" "}
              {orgName}.
            </Text>
          </Section>

          <Section className="ticket-shell" style={ticketShell}>
            <Row>
              <Column className="ticket-inset" style={ticketInset}>
                <Section className="ticket-card" style={ticketCard}>
                  <Section style={identifierGrid}>
                    <Row>
                      <Column
                        className="identifier-column"
                        style={identifierColumnLeft}
                      >
                        <Text style={identifierLabel}>Ticket number</Text>
                        <Text className="ticket-number" style={ticketNumberValue}>
                          #{ticketNumber}
                        </Text>
                      </Column>

                      <Column
                        className="identifier-column"
                        style={identifierColumnRight}
                      >
                        <Text style={identifierLabel}>Ticket reference</Text>
                        <Text className="ticket-reference" style={referenceValue}>
                          {ticketId}
                        </Text>
                      </Column>
                    </Row>
                  </Section>

                  <Hr style={ticketDivider} />

                  <Section style={detailGrid}>
                    <Row>
                      <Column
                        className="detail-column"
                        style={detailColumnLeft}
                      >
                        <Text style={detailLabel}>Date</Text>
                        <Text className="detail-value" style={detailValue}>
                          {date}
                        </Text>
                      </Column>

                      <Column className="detail-column" style={detailColumnRight}>
                        <Text style={detailLabel}>Pickup time</Text>
                        <Text className="detail-value" style={detailValue}>
                          {pickupTime}
                        </Text>
                      </Column>
                    </Row>
                  </Section>

                  {pickupLocation && (
                    <Section style={detailBlock}>
                      <Text style={detailLabel}>Pickup location</Text>
                      <Text className="detail-value" style={detailValue}>
                        {pickupLocation}
                      </Text>
                    </Section>
                  )}

                </Section>
              </Column>
            </Row>
          </Section>

          <Section className="instructions" style={instructions}>
            <Heading as="h2" style={h2}>
              Pickup instructions
            </Heading>

            <Text style={bodyText}>
              Bring this email, ticket number, or ticket reference when you
              collect your ticket. Please arrive during the pickup time shown
              above. If you can no longer attend, contact {orgName} as soon as
              possible.
            </Text>
          </Section>

          <Hr style={footerDivider} />

          <Section className="email-footer" style={footerSection}>
            <Text style={footer}>
              This email was sent automatically by {orgName}.
            </Text>

            <Text style={footerReference}>
              Ticket reference: {ticketId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const responsiveStyles = `
  @media only screen and (max-width: 600px) {
    .email-container {
      width: 100% !important;
      border-radius: 0 !important;
    }

    .email-header {
      padding: 28px 22px 20px !important;
    }

    .email-heading {
      font-size: 26px !important;
      line-height: 1.2 !important;
    }

    .email-introduction {
      font-size: 15px !important;
    }

    .ticket-inset {
      padding-left: 16px !important;
      padding-right: 16px !important;
    }

    .ticket-card {
      padding: 20px !important;
    }

    .ticket-number {
      font-size: 28px !important;
    }

    .identifier-column {
      display: block !important;
      width: 100% !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      text-align: left !important;
    }

    .identifier-column + .identifier-column {
      padding-top: 14px !important;
    }

    .detail-column {
      display: block !important;
      width: 100% !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    .detail-column + .detail-column {
      padding-top: 14px !important;
    }

    .instructions {
      padding: 24px 22px 4px !important;
    }

    .email-footer {
      padding-left: 22px !important;
      padding-right: 22px !important;
    }

    .detail-value {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }

    .ticket-reference {
      overflow-wrap: anywhere !important;
      word-break: break-all !important;
    }
  }
`;

const main = {
  margin: "0",
  padding: "24px 10px",
  backgroundColor: "#f5f5f5",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
  width: "100%",
  maxWidth: "600px",
  margin: "0 auto",
  overflow: "hidden",
  backgroundColor: "#ffffff",
  border: "1px solid #e5e5e5",
  borderRadius: "12px",
};

const header = {
  padding: "32px 36px 22px",
};

const organizationName = {
  margin: "0 0 12px",
  color: "#737373",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.06em",
  lineHeight: "1.4",
  overflowWrap: "anywhere" as const,
  textTransform: "uppercase" as const,
  wordBreak: "break-word" as const,
};

const h1 = {
  margin: "0",
  color: "#171717",
  fontSize: "30px",
  fontWeight: "700",
  letterSpacing: "0",
  lineHeight: "1.2",
};

const introduction = {
  margin: "10px 0 0",
  color: "#525252",
  fontSize: "15px",
  lineHeight: "1.55",
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const,
};

const ticketShell = {
  margin: "0",
};

const ticketInset = {
  padding: "0 36px",
};

const ticketCard = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "22px 24px 20px",
  backgroundColor: "#fafafa",
  border: "1px solid #dedede",
  borderRadius: "10px",
};

const identifierGrid = {
  margin: "0",
};

const identifierColumnLeft = {
  width: "38%",
  paddingRight: "12px",
  verticalAlign: "top" as const,
};

const identifierColumnRight = {
  width: "62%",
  paddingLeft: "12px",
  textAlign: "right" as const,
  verticalAlign: "top" as const,
};

const identifierLabel = {
  margin: "0 0 4px",
  color: "#737373",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.06em",
  lineHeight: "1.4",
  textTransform: "uppercase" as const,
};

const ticketNumberValue = {
  margin: "0",
  color: "#171717",
  fontSize: "32px",
  fontWeight: "700",
  letterSpacing: "0",
  lineHeight: "1.2",
};

const ticketDivider = {
  margin: "18px 0",
  borderColor: "#dedede",
};

const detailGrid = {
  margin: "0",
};

const detailColumnLeft = {
  width: "50%",
  paddingRight: "10px",
  verticalAlign: "top" as const,
};

const detailColumnRight = {
  width: "50%",
  paddingLeft: "10px",
  verticalAlign: "top" as const,
};

const detailBlock = {
  margin: "16px 0 0",
};

const detailLabel = {
  margin: "0 0 4px",
  color: "#737373",
  fontSize: "13px",
  lineHeight: "1.4",
};

const detailValue = {
  margin: "0",
  color: "#262626",
  fontSize: "15px",
  fontWeight: "600",
  lineHeight: "1.45",
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const,
};

const referenceValue = {
  margin: "0",
  color: "#171717",
  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: "32px",
  fontWeight: "700",
  lineHeight: "1.45",
  overflowWrap: "anywhere" as const,
  wordBreak: "break-all" as const,
};

const instructions = {
  padding: "26px 36px 4px",
};

const h2 = {
  margin: "0 0 10px",
  color: "#262626",
  fontSize: "18px",
  fontWeight: "650",
  lineHeight: "1.35",
};

const bodyText = {
  margin: "0",
  color: "#525252",
  fontSize: "14px",
  lineHeight: "1.65",
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const,
};

const footerDivider = {
  margin: "20px 36px 0",
  borderColor: "#e5e5e5",
};

const footerSection = {
  padding: "20px 36px 28px",
};

const footer = {
  margin: "0",
  color: "#737373",
  fontSize: "13px",
  lineHeight: "1.6",
  textAlign: "center" as const,
};

const footerReference = {
  margin: "6px 0 0",
  color: "#a3a3a3",
  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  fontSize: "11px",
  lineHeight: "1.5",
  overflowWrap: "anywhere" as const,
  textAlign: "center" as const,
  wordBreak: "break-all" as const,
};

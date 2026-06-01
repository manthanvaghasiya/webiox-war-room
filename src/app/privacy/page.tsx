export const metadata = {
  title: "Privacy Policy – Webiox Digital Solutions",
  description: "Privacy Policy for Webiox Digital Solutions WhatsApp Business messaging service.",
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", fontFamily: "sans-serif", color: "#111", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>Last updated: June 1, 2026</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>1. Who We Are</h2>
      <p>
        Webiox Digital Solutions ("Webiox", "we", "us") is a digital agency based in Surat, Gujarat, India.
        We build websites, CRM software, and automation workflows for businesses.
        Contact: <a href="mailto:hello@webiox.in" style={{ color: "#2563eb" }}>hello@webiox.in</a>
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>2. What Data We Collect</h2>
      <p>When you interact with us via WhatsApp or our platform, we may collect:</p>
      <ul>
        <li>Business name, phone number, and email address</li>
        <li>WhatsApp messages sent to or received from our business number</li>
        <li>Google Maps public data (business name, rating, phone, website)</li>
        <li>Publicly available LinkedIn and Instagram profile information</li>
      </ul>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>3. How We Use Your Data</h2>
      <p>We use collected data to:</p>
      <ul>
        <li>Send you information about Webiox services you may be interested in</li>
        <li>Respond to your enquiries and follow up on business conversations</li>
        <li>Improve our outreach and service quality</li>
      </ul>
      <p>We do <strong>not</strong> sell your data to third parties.</p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>4. WhatsApp Messaging</h2>
      <p>
        We use the WhatsApp Business Platform (Meta) to send business-related messages.
        By responding to our WhatsApp messages, you consent to receive follow-up communications from us.
        You can opt out at any time by replying <strong>STOP</strong> to any message.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>5. Data Storage</h2>
      <p>
        Your data is stored securely on Supabase (EU/US region) and is accessible only to
        authorised Webiox team members. We retain data for up to 2 years or until you request deletion.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>6. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Request access to the data we hold about you</li>
        <li>Request correction or deletion of your data</li>
        <li>Opt out of all communications at any time</li>
      </ul>
      <p>
        To exercise these rights, email us at{" "}
        <a href="mailto:hello@webiox.in" style={{ color: "#2563eb" }}>hello@webiox.in</a>
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>7. Cookies</h2>
      <p>
        Our web platform uses essential cookies for authentication only. We do not use
        tracking or advertising cookies.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>8. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. The latest version will always be available at
        this URL. Continued use of our services constitutes acceptance of any changes.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 32 }}>9. Contact</h2>
      <p>
        Webiox Digital Solutions<br />
        Surat, Gujarat, India<br />
        <a href="mailto:hello@webiox.in" style={{ color: "#2563eb" }}>hello@webiox.in</a>
      </p>

      <p style={{ marginTop: 48, color: "#999", fontSize: 13 }}>
        © 2026 Webiox Digital Solutions. All rights reserved.
      </p>
    </main>
  );
}

import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const PAGE_CONTENT = {
  about: {
    eyebrow: 'About FlixHub',
    title: 'Make room for a good story.',
    intro: 'FlixHub helps you discover films and series with less scrolling and more confidence. Save what catches your eye, keep track of what you started, and find your next favorite at your own pace.',
    sections: [
      ['A calmer way to browse', 'We bring together popular releases, thoughtful categories, and useful details so choosing what to watch feels easy.'],
      ['Your library, your way', 'Your Watchlist and viewing history are designed to help you pick up where you left off without losing the thread.'],
      ['Built with care', 'We keep improving the experience around clarity, accessibility, and respectful handling of your information.'],
    ],
  },
  careers: {
    eyebrow: 'Careers',
    title: 'Help shape better evenings.',
    intro: 'We are building a small, thoughtful team around the idea that entertainment products should feel welcoming, useful, and human.',
    sections: [
      ['What we value', 'Curiosity, clear communication, careful craft, and respect for the people who use what we make.'],
      ['Open roles', 'There are no open roles right now. Check back here for future opportunities across product, engineering, design, and partnerships.'],
      ['Stay in touch', 'For future opportunities, contact our team at careers@flixhub.example.'],
    ],
  },
  press: {
    eyebrow: 'Press',
    title: 'The FlixHub story.',
    intro: 'For product information, interviews, and media requests, our press team is happy to help.',
    sections: [
      ['Media inquiries', 'Contact press@flixhub.example with your publication, deadline, and the details you need.'],
      ['Brand assets', 'Approved logos and product images are available on request. Please include how and where the materials will be used.'],
      ['Product updates', 'We share meaningful product news as it becomes available.'],
    ],
  },
  investors: {
    eyebrow: 'Investor Relations',
    title: 'Building for the long term.',
    intro: 'We believe a durable entertainment product starts with a clear purpose: helping people spend less time searching and more time enjoying stories.',
    sections: [
      ['Company information', 'For business and investor inquiries, contact investors@flixhub.example.'],
      ['Updates', 'Material company updates will be published here when available.'],
    ],
  },
  terms: {
    eyebrow: 'Terms of Service',
    title: 'The agreement for using FlixHub.',
    intro: 'By using FlixHub, you agree to use the service responsibly and follow these terms. These terms are written to be readable, but they do not replace legal advice.',
    sections: [
      ['Using the service', 'You may use FlixHub for personal, lawful purposes. Do not misuse the service, attempt to disrupt it, access accounts or data that are not yours, or use automated systems to place unreasonable load on the product.'],
      ['Content and availability', 'FlixHub may link to or display information from third-party services. Availability, accuracy, and rights for that content may be controlled by those providers. Features may change, be suspended, or be discontinued as the service develops.'],
      ['Your account and activity', 'You are responsible for activity performed through your account and for keeping access credentials secure. Tell us promptly if you believe your account has been compromised.'],
      ['Changes and contact', 'We may update these terms when the service changes. Continued use after an update means you accept the revised terms. Questions can be sent to support@flixhub.example.'],
    ],
  },
  privacy: {
    eyebrow: 'Privacy Policy',
    title: 'Your information, handled thoughtfully.',
    intro: 'This policy explains what FlixHub may collect, why we use it, and the choices available to you. Last updated: September 13, 2026.',
    sections: [
      ['Information you provide', 'We may receive information you choose to provide, such as an email address when you contact support or create an account.'],
      ['Information collected automatically', 'We may collect device, browser, diagnostic, and usage information needed to operate, secure, and improve the service. Watchlist and history data may be stored to provide those features.'],
      ['How we use information', 'We use information to provide features, respond to requests, maintain security, understand product performance, and communicate important service changes. We do not sell personal information.'],
      ['Your choices', 'You can contact support@flixhub.example to ask about accessing, correcting, or deleting personal information, subject to applicable legal requirements.'],
    ],
  },
  cookies: {
    eyebrow: 'Cookie Preferences',
    title: 'You are in control of your choices.',
    intro: 'Cookies and similar technologies help websites remember preferences, understand usage, and keep sessions secure.',
    sections: [
      ['Essential technologies', 'Some storage is required for core features such as authentication, security, and keeping your Watchlist available. These cannot be disabled through the product.'],
      ['Analytics', 'Where enabled, analytics help us understand which experiences are useful and where the product needs improvement.'],
      ['Manage preferences', 'You can control cookies through your browser settings. Blocking some technologies may affect how parts of FlixHub work.'],
    ],
  },
  legal: {
    eyebrow: 'Legal Notices',
    title: 'Important information about FlixHub.',
    intro: 'FlixHub is a discovery and organization experience. Availability and rights for titles, artwork, metadata, and playback may belong to their respective providers and owners.',
    sections: [
      ['Third-party services', 'Some features may connect to third-party APIs or playback providers. Their terms, privacy policies, and availability apply to those services.'],
      ['Trademarks and content', 'Names, logos, artwork, and other materials remain the property of their respective owners. Nothing on FlixHub transfers ownership rights.'],
      ['Contact', 'For legal notices or rights questions, contact legal@flixhub.example.'],
    ],
  },
  accessibility: {
    eyebrow: 'Accessibility',
    title: 'Entertainment should be easy to access.',
    intro: 'We are committed to making FlixHub usable by as many people as possible and to improving the experience as we learn.',
    sections: [
      ['Our approach', 'We work toward clear structure, keyboard-friendly controls, readable contrast, meaningful labels, and responsive layouts.'],
      ['Need help?', 'If you encounter an accessibility barrier, contact accessibility@flixhub.example with the page, device, and assistive technology involved if you can share them.'],
      ['Ongoing work', 'Accessibility is an ongoing practice. Feedback helps us prioritize improvements that make the biggest difference.'],
    ],
  },
};

export default function InfoPage() {
  const { page } = useParams();
  const content = PAGE_CONTENT[page] ?? PAGE_CONTENT.about;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-32 sm:px-8">
        <Link to="/" className="text-sm font-semibold text-brand-light transition hover:text-white">
          ← Back to FlixHub
        </Link>
        <header className="mt-8 border-b border-ink-border pb-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">{content.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">{content.title}</h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted">{content.intro}</p>
        </header>
        <div className="divide-y divide-ink-border">
          {content.sections.map(([heading, body]) => (
            <section key={heading} className="py-8">
              <h2 className="text-xl font-bold text-white">{heading}</h2>
              <p className="mt-3 max-w-3xl leading-7 text-muted">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

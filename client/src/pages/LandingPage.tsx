import { Link } from "react-router-dom";
import { useState } from "react";
import { BRAND } from "@/lib/utils";
import {
  Calendar,
  Shield,
  Users,
  FileText,
  CheckCircle2,
  MessageCircle,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";

const WHATSAPP = "254111722702"; // 0111722702 international
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
  "Hello Chosen Digital Solutions, I would like to know more about Chosen Time Tables pricing and how to get started."
)}`;

const faqs = [
  {
    q: "Who is Chosen Time Tables for?",
    a: "Kenyan primary and secondary schools running CBC or 8-4-4 that need reliable master, class and teacher timetables.",
  },
  {
    q: "Can HODs manage their own subjects?",
    a: "Yes. Heads of Department work within their department: teachers, learning areas and lesson allocations. The timetable administrator or principal approves and generates the timetable.",
  },
  {
    q: "Does it support double lessons and breaks?",
    a: "Yes. Configure periods including short break, long break, lunch and games. Double lessons are scheduled in consecutive periods.",
  },
  {
    q: "How do we get pricing?",
    a: "Chat with us on WhatsApp. We will share current plans and help you start a trial for your school.",
  },
  {
    q: "Is our school data private?",
    a: "Yes. Each school’s data is isolated. Other schools cannot see your teachers, classes or timetables.",
  },
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: BRAND.blue }}
            >
              CT
            </div>
            <div>
              <div className="font-semibold leading-tight">Chosen Time Tables</div>
              <div className="text-[11px] text-slate-500">Chosen Digital Solutions</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button onClick={() => scrollTo("how")} className="hover:text-slate-900">
              How it works
            </button>
            <button onClick={() => scrollTo("why")} className="hover:text-slate-900">
              Why us
            </button>
            <button onClick={() => scrollTo("faq")} className="hover:text-slate-900">
              FAQ
            </button>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-900"
            >
              Pricing
            </a>
            <Link to="/login" className="hover:text-slate-900">
              Log in
            </Link>
            <Link
              to="/register"
              className="text-white px-4 py-2 rounded-lg"
              style={{ backgroundColor: BRAND.blue }}
            >
              Get started
            </Link>
          </nav>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-100"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="md:hidden border-t bg-white px-4 py-3 space-y-2 text-sm font-medium">
            <button onClick={() => scrollTo("how")} className="block w-full text-left py-2">
              How it works
            </button>
            <button onClick={() => scrollTo("why")} className="block w-full text-left py-2">
              Why us
            </button>
            <button onClick={() => scrollTo("faq")} className="block w-full text-left py-2">
              FAQ
            </button>
            <a href={WHATSAPP_LINK} target="_blank" rel="noreferrer" className="block py-2">
              Pricing (WhatsApp)
            </a>
            <Link to="/login" className="block py-2">
              Log in
            </Link>
            <Link
              to="/register"
              className="block text-center text-white px-4 py-2 rounded-lg"
              style={{ backgroundColor: BRAND.blue }}
            >
              Get started
            </Link>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-4 py-16 md:py-22 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p
              className="text-sm font-semibold tracking-wide uppercase mb-3"
              style={{ color: BRAND.orange }}
            >
              Built for Kenyan schools · CBC-ready
            </p>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-5">
              Conflict-free timetables your school can actually use
            </h1>
            <p className="text-lg text-slate-600 mb-8">
              Generate master, class and teacher timetables with hard constraints, double lessons,
              HOD allocations, exams and remedial sessions — in one secure workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-white font-medium shadow-sm"
                style={{ backgroundColor: BRAND.blue }}
              >
                Start free trial
              </Link>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 justify-center px-6 py-3 rounded-lg border border-slate-300 font-medium text-slate-700 hover:bg-white bg-white"
              >
                <MessageCircle className="w-4 h-4" style={{ color: "#25D366" }} />
                Chat on WhatsApp
              </a>
            </div>

          </div>
          <div className="bg-white rounded-2xl border shadow-sm p-6 md:p-8 space-y-4">
            {[
              "No teacher or class clashes (hard constraints)",
              "Double lessons, breaks, games & assembly periods",
              "HOD workflow → Timetable Admin approval → Generate",
              "Master, class & teacher views with PDF export",
              "Exam & remedial schedules",
              "Role-based access and school data isolation",
            ].map((item) => (
              <div key={item} className="flex gap-3 text-sm text-slate-700">
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: BRAND.green }} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="bg-white border-y">
          <div className="max-w-6xl mx-auto px-4 py-16">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">How it works</h2>
            <p className="text-slate-600 mb-10 max-w-2xl">
              A clear path from school setup to published timetables.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: "1",
                  title: "Set up your school",
                  body: "Add departments, teachers, classes, learning areas and periods.",
                  icon: Users,
                },
                {
                  step: "2",
                  title: "HODs allocate lessons",
                  body: "Each HOD assigns teachers to classes for subjects in their department.",
                  icon: FileText,
                },
                {
                  step: "3",
                  title: "Approve & generate",
                  body: "Timetable admin approves allocations and generates a conflict-free grid.",
                  icon: Calendar,
                },
                {
                  step: "4",
                  title: "Publish & export",
                  body: "Share class and teacher views. Download PDF or CSV for printing.",
                  icon: Shield,
                },
              ].map((s) => (
                <div key={s.step} className="rounded-xl border bg-slate-50 p-5">
                  <div
                    className="w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center mb-3"
                    style={{ backgroundColor: BRAND.blue }}
                  >
                    {s.step}
                  </div>
                  <s.icon className="w-5 h-5 mb-2 text-slate-500" />
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-slate-600">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why */}
        <section id="why" className="max-w-6xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Why Chosen Time Tables</h2>
          <p className="text-slate-600 mb-10 max-w-2xl">
            Designed around how Kenyan schools actually run departments and timetables.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Hard constraints",
                body: "The engine refuses teacher and class clashes. You get a usable timetable, not a puzzle.",
              },
              {
                title: "Department workflow",
                body: "HODs own their subjects. Principals and timetable admins keep full control of generation.",
              },
              {
                title: "Print-ready outputs",
                body: "Class and teacher PDFs with clear titles so printed stacks stay organised.",
              },
            ].map((c) => (
              <div key={c.title} className="bg-white border rounded-xl p-6 shadow-sm">
                <h3 className="font-semibold text-lg mb-2">{c.title}</h3>
                <p className="text-sm text-slate-600">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing CTA — no amounts */}
        <section className="bg-slate-900 text-white">
          <div className="max-w-6xl mx-auto px-4 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold mb-2">Talk to us about pricing</h2>
              <p className="text-slate-300 text-sm max-w-xl">
                Plans depend on your school size and needs. Message Chosen Digital Solutions on
                WhatsApp and we will guide you.
              </p>
            </div>
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-slate-900 bg-white hover:bg-slate-100"
            >
              <MessageCircle className="w-5 h-5" style={{ color: "#25D366" }} />
              WhatsApp 0111722702
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-8">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={f.q} className="bg-white border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between text-left px-5 py-4 font-medium"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {f.q}
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition ${openFaq === i ? "rotate-180" : ""}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm text-slate-600 border-t bg-slate-50">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t bg-white py-8 text-center text-sm text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          © {new Date().getFullYear()} Chosen Digital Solutions · Chosen Time Tables
          <div className="mt-2">
            <a href={WHATSAPP_LINK} className="underline" style={{ color: BRAND.blue }}>
              WhatsApp 0111722702
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

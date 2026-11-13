import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import s from './landing.module.css';
import { BRAND, withCanonical } from '@/lib/brand';
import { HOMEPAGE_FAQ } from '@/lib/faq';

export const metadata: Metadata = withCanonical('/', {
  title: BRAND.title,
  description: BRAND.description,
});

const RESEARCH_MAIL = 'mailto:support@datalyst.one?subject=Research%20access';

// Hero chart: an illustrative negative relationship (caffeine late in the day vs sleep quality).
const points: [number, number][] = [
  [0, 8.6], [0, 7.9], [0, 8.2], [50, 7.4], [50, 8.1], [50, 7.0], [80, 7.6], [80, 6.9], [100, 7.2],
  [100, 6.4], [120, 6.8], [150, 6.1], [150, 6.9], [160, 5.8], [180, 6.3], [200, 5.5], [200, 6.0],
  [220, 5.2], [240, 5.7], [250, 4.9], [280, 5.0], [300, 4.4], [300, 5.3], [320, 4.6], [350, 4.1],
];
const W = 460, H = 230, PAD = 28;
const x = (mg: number) => PAD + (mg / 360) * (W - PAD * 2);
const y = (q: number) => H - PAD - ((q - 3.5) / 5.5) * (H - PAD * 2);

const matrixVars = ['Sleep', 'Mood', 'Steps', 'Coffee'];
const matrix = [
  [1, 0.58, 0.31, -0.62],
  [0.58, 1, 0.44, -0.18],
  [0.31, 0.44, 1, 0.05],
  [-0.62, -0.18, 0.05, 1],
];
const cellColor = (r: number) =>
  r >= 0 ? `rgba(94, 211, 181, ${0.12 + r * 0.78})` : `rgba(255, 138, 107, ${0.12 + -r * 0.78})`;

// Two blocks of A/B with washout days, as the Lab generates them.
const schedule = ['A', 'A', 'W', 'B', 'B', 'W', 'B', 'B', 'W', 'A', 'A', 'W', 'B', 'B'];

const rigor = [
  { tag: 'Protocol', title: 'Pre registration', copy: 'Record the hypothesis and outcome before collecting results, so later changes can be compared with the original plan.' },
  { tag: 'Design', title: 'Blocked randomization', copy: 'Shuffle conditions within balanced blocks to reduce imbalance and help investigate time trends.' },
  { tag: 'Design', title: 'Washout periods', copy: 'Plan buffer days between conditions to reduce carryover when an appropriate washout duration is known.' },
  { tag: 'Bias', title: 'Blinding check', copy: 'Run blind trials and measure how well the blind held with the Bang index.' },
  { tag: 'Planning', title: 'Power analysis', copy: 'Know how many days you need to detect the effect size you care about.' },
  { tag: 'Analysis', title: 'Carryover and period tests', copy: 'Checks for order effects and autocorrelation before trusting the difference.' },
  { tag: 'Analysis', title: 'Bayesian and frequentist', copy: 'Effect sizes, p values and posterior estimates under explicit statistical assumptions.' },
  { tag: 'Output', title: 'Audit report and API', copy: 'Raw data export, a methods audit report and an API to run protocols from your own tools.' },
];

export default function Home() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={`${s.frame} ${s.headerInner}`}>
          <Link href="/" className={s.brand} aria-label="Datalyst home">
            <Image src="/assets/logo.png" alt="" width={28} height={28} priority />
            Datalyst
          </Link>
          <nav className={s.nav} aria-label="Main navigation">
            <Link href="#research" className={s.navHideSm}>Research</Link>
            <Link href="/login">Log in</Link>
            <Link href="/register" className={s.navCta}>Start free</Link>
          </nav>
        </div>
      </header>

      <main className={s.frame}>
        <section className={s.section}>
          <div className={s.label}><span><b>01</b> / Symptom and habit tracker</span><span>iOS · Android · Web</span></div>
          <div className={s.hero}>
            <div className={s.heroCopy}>
              <h1 className={s.h1}>
                Log symptoms and habits and discover what affects your <span className={s.accent}>health</span>.
              </h1>
              <p className={s.lede}>
                Track symptoms, sleep, energy and habits. Discover patterns and run personal experiments,
                whether you are managing symptoms or biohacking your routine.
              </p>
              <div className={s.actions}>
                <Link href="/register" className={`${s.btn} ${s.btnSolid}`}>
                  Start tracking free <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="#research" className={`${s.btn} ${s.btnGhost}`}>For researchers</Link>
              </div>
              <div className={s.tags}>
                <span className={`${s.tag} ${s.tagViolet}`}>Pearson + Spearman</span>
                <span className={`${s.tag} ${s.tagTeal}`}>P values</span>
                <span className={`${s.tag} ${s.tagAmber}`}>Randomized N of 1</span>
                <span className={s.tag}>Free to start</span>
              </div>
            </div>

            <div className={s.heroVisual}>
              <figure className={s.window} style={{ margin: 0 }}>
                <div className={s.windowBar}>
                  <span className={s.dots} aria-hidden="true"><i /><i /><i /></span>
                  <span>Insight · Coffee after 2pm × Sleep</span>
                </div>
                <div className={s.windowBody}>
                  <svg className={s.chart} viewBox={`0 0 ${W} ${H}`} role="img"
                    aria-label="Scatter plot: more caffeine after 2pm goes with lower sleep quality">
                    {[0, 1, 2, 3].map((i) => (
                      <line key={i} x1={PAD} x2={W - PAD} y1={PAD + i * ((H - PAD * 2) / 3)} y2={PAD + i * ((H - PAD * 2) / 3)}
                        stroke="rgba(242,241,238,0.08)" />
                    ))}
                    <line x1={x(0)} y1={y(8.3)} x2={x(350)} y2={y(4.3)} stroke="#9d9fff" strokeWidth="2" strokeDasharray="5 5" />
                    {points.map(([mg, q], i) => (
                      <circle key={i} cx={x(mg)} cy={y(q)} r="4.5" fill="#ff8a6b" fillOpacity="0.9" />
                    ))}
                    <text x={PAD} y={H - 6} fill="rgba(242,241,238,0.45)" fontSize="10" fontFamily="monospace">CAFFEINE AFTER 2PM (MG)</text>
                    <text x={PAD} y={PAD - 10} fill="rgba(242,241,238,0.45)" fontSize="10" fontFamily="monospace">SLEEP QUALITY</text>
                  </svg>
                </div>
                <figcaption className={s.stats}>
                  <div className={s.stat}><span>Pearson r</span><strong>−0.62</strong></div>
                  <div className={s.stat}><span>p value</span><strong>0.004</strong></div>
                  <div className={s.stat}><span>Days</span><strong>42</strong></div>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className={s.section} id="how-it-works">
          <div className={s.label}><span><b>02</b> / The loop</span><span>Track · Correlate · Experiment</span></div>
          <div className={s.intro}>
            <h2 className={s.h2}>From guessing to <span className={s.accentTeal}>knowing</span> in three steps.</h2>
            <p className={s.body}>
              Log symptoms and habits, see what moves together, then test the pattern that matters to how you feel.
            </p>
          </div>
          <div className={s.lineup}>
            <article className={s.card}>
              <div className={s.cardHead}><span className={`${s.num} ${s.numViolet}`}>01</span><span>Track</span></div>
              <div className={s.cardVisual} aria-hidden="true">
                <div className={s.checkin}>
                  <div className={s.row}>Sleep quality <em className={s.done}>8 / 10 ✓</em></div>
                  <div className={s.row}>Coffee after 2pm <em className={s.done}>1 cup ✓</em></div>
                  <div className={s.row}>Energy <em>tap to log</em></div>
                </div>
              </div>
              <div className={s.cardCopy}>
                <h3 className={s.h3}>Log a symptom or a habit in under a minute.</h3>
                <p className={s.body}>Migraine, sleep, mood, caffeine, a walk: anything you can count or rate. A daily check-in keeps it short. For doses, one tap per cup, and Datalyst shows what is still in you when you go to bed.</p>
              </div>
            </article>

            <article className={s.card}>
              <div className={s.cardHead}><span className={`${s.num} ${s.numTeal}`}>02</span><span>Correlate</span></div>
              <div className={s.cardVisual} aria-hidden="true">
                <div className={s.matrix}>
                  {matrix.map((row, i) => (
                    <div key={i} style={{ display: 'contents' }}>
                      <span className={s.rowLabel}>{matrixVars[i]}</span>
                      {row.map((r, j) => <div key={j} className={s.cell} style={{ background: cellColor(r) }} />)}
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.cardCopy}>
                <h3 className={s.h3}>See what lines up with how you feel.</h3>
                <p className={s.body}>Correlations across your symptoms and habits, so a pattern is a number, not a hunch. A pattern is not proof of cause.</p>
              </div>
            </article>

            <article className={s.card}>
              <div className={s.cardHead}><span className={`${s.num} ${s.numAmber}`}>03</span><span>Experiment</span></div>
              <div className={s.cardVisual} aria-hidden="true">
                <div className={s.schedule}>
                  <div className={s.blocks}>
                    {schedule.map((d, i) => (
                      <div key={i} className={`${s.day} ${d === 'A' ? s.dayA : d === 'B' ? s.dayB : s.dayW}`}>{d === 'W' ? '' : d}</div>
                    ))}
                  </div>
                  <div className={s.legend}>
                    <span><i style={{ background: '#f5b54a' }} />No coffee</span>
                    <span><i style={{ background: '#9d9fff' }} />Coffee</span>
                    <span><i style={{ border: '1px dashed rgba(242,241,238,.3)' }} />Washout</span>
                  </div>
                </div>
              </div>
              <div className={s.cardCopy}>
                <h3 className={s.h3}>Test it with a personal trial.</h3>
                <p className={s.body}>Turn a question into a randomized self experiment. Datalyst schedules the days, tracks compliance and helps you assess the results.</p>
              </div>
            </article>
          </div>
        </section>

        <section className={s.section} id="research">
          <div className={s.label}><span><b>03</b> / For research</span><span>Single subject trials</span></div>
          <div className={s.research}>
            <div className={s.researchCopy}>
              <h2 className={s.h2}>Built to the standard of a <span className={s.accent}>real study</span>.</h2>
              <p className={s.body}>
                Datalyst runs N of 1 trials the way methodologists recommend, so the result holds up when someone
                else reads it. Use it for your own questions, with patients and clients, or as the data layer of a study.
              </p>
              <div className={s.actions}>
                <a href={RESEARCH_MAIL} className={`${s.btn} ${s.btnSolid}`}>Request research access <ArrowRight size={16} aria-hidden="true" /></a>
                <Link href="/docs/agent-api" className={`${s.btn} ${s.btnGhost}`}>API docs <ArrowUpRight size={16} aria-hidden="true" /></Link>
              </div>
            </div>
            <div className={s.researchList}>
              {rigor.map((f) => (
                <div key={f.title} className={s.feature}>
                  <small>{f.tag}</small>
                  <h4>{f.title}</h4>
                  <p>{f.copy}</p>
                </div>
              ))}
            </div>
          </div>
          <div className={s.audiences}>
            <div className={s.audience}>
              <span className={`${s.tag} ${s.tagViolet}`} style={{ alignSelf: 'flex-start' }}>Biohackers and self experimenters</span>
              <h3 className={s.h3}>Find what works for you.</h3>
              <p className={s.body}>Track sleep, energy, caffeine and training together. Explore your patterns, then test a change with a personal experiment.</p>
            </div>
            <div className={s.audience}>
              <span className={`${s.tag} ${s.tagTeal}`} style={{ alignSelf: 'flex-start' }}>Clinicians and coaches</span>
              <h3 className={s.h3}>Test what works for one person.</h3>
              <p className={s.body}>Your patient or client runs the protocol on their phone and shares the results page with you.</p>
            </div>
            <div className={s.audience}>
              <span className={`${s.tag} ${s.tagAmber}`} style={{ alignSelf: 'flex-start' }}>Research teams</span>
              <h3 className={s.h3}>Running a study with many people?</h3>
              <p className={s.body}>We are opening research access: multi participant protocols, cohort exports and API keys. Tell us what your study needs.</p>
            </div>
          </div>
        </section>

        <section className={s.section} id="questions">
          <div className={s.label}><span><b>04</b> / Questions</span><span>Straight answers</span></div>
          <div className={s.intro}>
            <h2 className={s.h2}>The questions people ask <span className={s.accentTeal}>before</span> they start.</h2>
          </div>
          <div className={s.questions}>
            {HOMEPAGE_FAQ.map((item) => (
              <div key={item.q} className={s.question}>
                <h3 className={s.h3}>{item.q}</h3>
                <p className={s.body}>{item.a}</p>
              </div>
            ))}
          </div>
          <p className={s.sources}>
            Method and sources: randomized N of 1 trials as described on
            {' '}<a href="https://en.wikipedia.org/wiki/N-of-1_trial" target="_blank" rel="noopener noreferrer">Wikipedia</a>,
            the implementation is open source on
            {' '}<a href="https://github.com/cYoren/datalyst" target="_blank" rel="noopener noreferrer">GitHub</a>
            {' '}under the
            {' '}<a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">AGPL-3.0 license</a>.
          </p>
        </section>

        <section className={s.section}>
          <div className={s.label}><span><b>05</b> / Start</span><span>Free to start</span></div>
          <div className={s.cta}>
            <h2 className={s.h2}>Start with how you <span className={s.accent}>feel</span> today.</h2>
            <p className={s.lede}>Log one symptom and one habit. Datalyst takes it from there.</p>
            <Link href="/register" className={`${s.btn} ${s.btnSolid}`}>Create free account <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>

        <footer className={s.footer}>
          <span>© {new Date().getFullYear()} Datalyst · CNPJ 64.661.660/0001-04</span>
          <nav aria-label="Legal">
            <Link href="/conditions">Conditions</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/contact">Contact</Link>
          </nav>
        </footer>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: HOMEPAGE_FAQ.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            }).replace(/</g, '\\u003c'),
          }}
        />
      </main>
    </div>
  );
}

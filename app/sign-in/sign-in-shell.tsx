import Image from "next/image";
import localFont from "next/font/local";
import { AccessShell } from "../access-shell";
import bee from "../../public/home/bee.png";
import logo from "../../public/home/logo.png";
import access from "../../public/home/icon-access.png";
import "./sign-in.css";

const display = localFont({ src: "../fonts/bricolage-grotesque.woff2", weight: "200 800", variable: "--sign-in-display", display: "swap" });
const mono = localFont({ src: "../fonts/jetbrains-mono.woff2", weight: "100 800", variable: "--sign-in-mono", display: "swap" });

export function SignInShell({ children }: { children: React.ReactNode }) {
  return <AccessShell className={`sign-in ${display.variable} ${mono.variable}`}
    brand={<><Image src={logo} alt="" width={40} height={40} /><span>Vibies</span></>}>
    <div className="sign-in-body">
      {children}
      <div className="sign-in-mascot" aria-hidden="true">
        <Image src={bee} alt="" sizes="(max-width: 760px) 180px, (max-width: 1000px) 220px, 380px" priority />
      </div>
    </div>
  </AccessShell>;
}

export function PrivacyNote() {
  return <div className="sign-in-privacy">
    <div className="sign-in-badge" aria-hidden="true">
      <svg viewBox="0 0 100 86.6"><polygon points="25,0.8 75,0.8 99.2,43.3 75,85.8 25,85.8 0.8,43.3" /></svg>
      <Image src={access} alt="" sizes="48px" />
    </div>
    <p className="hint">We keep your GitHub account ID and username for access checks. Members see your agreed nickname.</p>
  </div>;
}

export function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function GitHubMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.09c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.01-.12-.29-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15a10.77 10.77 0 0 1 5.64 0c2.15-1.46 3.1-1.15 3.1-1.15.61 1.55.23 2.69.11 2.98.72.78 1.16 1.78 1.16 3.01 0 4.32-2.64 5.27-5.15 5.55.4.35.76 1.03.76 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z" /></svg>;
}

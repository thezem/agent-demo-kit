import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DemoRunner } from "../../src/react";
import { demo, type DemoContext } from "../../src/index";
import "./style.css";

type Task = { id: number; title: string; description: string; status: "Ready" | "In progress" | "Done" };
type Activity = { id: number; title: string; detail?: string };
const seed: Task[] = [
  { id: 1, title: "Review launch page", description: "Check the story and calls to action before handoff.", status: "Ready" },
  { id: 2, title: "Polish onboarding copy", description: "Make the first-run guidance shorter and more specific.", status: "In progress" },
  { id: 3, title: "Approve product screenshots", description: "Confirm the final visual set for launch notes.", status: "Done" }
];

async function walkthrough({ page, show }: DemoContext) {
  await show("A complete launch review, performed in the real interface");
  await page.goto("/workspace");
  await page.getByRole("heading", { name: "Your workspace" }).expectVisible();
  await page.getByRole("button", { name: "Search projects" }).click();
  await page.getByPlaceholder("Find a project").fill("Apollo");
  await page.getByRole("link", { name: "Open Apollo launch" }).click();
  await page.getByRole("heading", { name: "Apollo launch" }).expectVisible();
  await show("Inspect the board before adding work");
  await page.getByRole("button", { name: "Board" }).click();
  await page.getByRole("heading", { name: "Ready" }).expectVisible();
  await page.getByRole("button", { name: "Filter tasks" }).click();
  await page.getByPlaceholder("Filter by task title").fill("Review");
  await page.getByRole("button", { name: "Review launch page" }).expectVisible();
  await page.getByPlaceholder("Filter by task title").fill("");
  await show("Create the missing review task");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByRole("heading", { name: "Create a task" }).expectVisible();
  await page.getByPlaceholder("What needs to be done?").fill("Check mobile checkout");
  await page.getByPlaceholder("Add the context a teammate needs").fill("Walk through the purchase flow at a narrow viewport and record any friction.");
  await page.getByRole("button", { name: "Create task" }).click();
  await page.getByRole("button", { name: "Check mobile checkout" }).expectVisible();
  await page.getByRole("button", { name: "Check mobile checkout" }).click();
  await page.getByRole("heading", { name: "Check mobile checkout" }).expectVisible();
  await show("Move it into active work and leave a note");
  await page.getByRole("button", { name: "Start work" }).click();
  await page.locator(".drawer .status").expectText("In progress");
  await page.getByPlaceholder("Write a progress note").fill("Mobile flow checked. Payment step needs one clearer label.");
  await page.getByRole("button", { name: "Post note" }).click();
  await page.getByText("Mobile flow checked. Payment step needs one clearer label.").expectVisible();
  await page.getByRole("button", { name: "Close task" }).click();
  await show("Verify the change in project activity");
  await page.getByRole("button", { name: "Activity" }).click();
  await page.getByRole("heading", { name: "Project activity" }).expectVisible();
  await page.getByText("Mobile flow checked. Payment step needs one clearer label.").expectVisible();
  await show("The task, status and note are visible. Review complete.");
}
const demos = [demo("launch-review", walkthrough), demo("project-search", walkthrough)];

function App() {
  const project = location.pathname.startsWith("/workspace/apollo");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"Overview" | "Board" | "Activity">("Overview");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [tasks, setTasks] = useState<Task[]>(seed);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<Record<number, string[]>>({});
  const selected = tasks.find(task => task.id === selectedId);
  const log = (eventTitle: string, detail?: string) => setActivity(current => [{ id: Date.now() + Math.random(), title: eventTitle, detail }, ...current]);
  const createTask = (event: React.FormEvent) => { event.preventDefault(); if (!title.trim()) return; const task: Task = { id: Date.now(), title: title.trim(), description: description.trim(), status: "Ready" }; setTasks(current => [task, ...current]); log(`Created ${task.title}`); setCreating(false); setTitle(""); setDescription(""); setTab("Board"); };
  const startWork = () => { if (!selected) return; setTasks(current => current.map(task => task.id === selected.id ? { ...task, status: "In progress" } : task)); log(`Moved ${selected.title} to In progress`); };
  const postNote = (event: React.FormEvent) => { event.preventDefault(); if (!selected || !note.trim()) return; const text = note.trim(); setNotes(current => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), text] })); log(`Added a note to ${selected.title}`, text); setNote(""); };
  return <div className="shell">
    <aside className="rail"><a className="brand" href="/workspace"><span className="brand-mark">F</span>fieldnotes<span className="period">.</span></a><div className="rail-caption">SAMPLE WORKSPACE</div><a className={`rail-link ${!project ? "active" : ""}`} href="/workspace">Workspace</a><a className={`rail-link ${project ? "active" : ""}`} href="/workspace/apollo">Apollo launch</a><div className="rail-user"><span className="avatar">HL</span><span>Hazel Lane<small>Example account</small></span></div></aside>
    <div className="content"><header className="topbar"><span>{project ? "Workspace / Apollo launch" : "Workspace"}</span><span>Example app for agent-demo-kit</span></header>
      {!project ? <main className="main"><div className="eyebrow">MONDAY, SEPTEMBER 28</div><div className="title-row"><div><h1>Your workspace</h1><p>Pick up where your team left off.</p></div><button className="outline" onClick={() => setSearchOpen(value => !value)}>Search projects</button></div>
        {searchOpen && <input className="project-search" autoFocus placeholder="Find a project" aria-label="Find a project" value={query} onChange={event => setQuery(event.target.value)} />}
        {(!query || "apollo launch".includes(query.toLowerCase())) ? <section className="featured"><div className="feature-art"><div className="orbit"><span>APOLLO</span><b>01</b></div><small>LAUNCH PLAN<br/>AUTUMN EDITION</small></div><div className="feature-copy"><div className="eyebrow">CURRENT PROJECT</div><h2>Apollo launch</h2><p>A shared place to review the last details before release. Follow tasks from idea to sign-off.</p><div className="feature-meta">3 sample tasks <span>Board & activity</span></div><a className="primary-link" href="/workspace/apollo" aria-label="Open Apollo launch">Open project <span aria-hidden="true">↗</span></a></div></section> : <p className="empty">No sample project matches that search.</p>}
        <div className="workspace-foot"><b>ONE THING TO REVIEW</b><span>“Review launch page” is ready for a final pass.</span></div>
      </main> : <main className="main"><div className="project-title"><div><div className="eyebrow">PROJECT / APOLLO</div><h1>Apollo launch</h1><p>The final stretch, in one place.</p></div><div className="stamp">A<span>24</span></div></div><div className="tabs-row"><nav aria-label="Project views" className="tabs">{(["Overview", "Board", "Activity"] as const).map(view => <button key={view} className={tab === view ? "selected" : ""} onClick={() => setTab(view)}>{view}</button>)}</nav><button className="solid" onClick={() => setCreating(true)}>New task</button></div>
        {tab === "Overview" && <section className="overview"><div><div className="eyebrow">PROJECT BRIEF</div><h2>Small details,<br/>better launch.</h2><p>This fictional workspace tracks final review work. Open the board, create a task, and follow its activity.</p><button className="text-button" onClick={() => setTab("Board")}>View the board ↗</button></div><div className="focus"><h3>Focus now</h3>{tasks.filter(task => task.status !== "Done").map(task => <div className="focus-row" key={task.id}><strong>{task.title}</strong><small>{task.status}</small></div>)}</div></section>}
        {tab === "Board" && <section className="board"><div className="section-head"><div><div className="eyebrow">WORK IN MOTION</div><h2>Project board</h2></div><button className="outline" onClick={() => setFilterOpen(value => !value)}>Filter tasks</button></div>{filterOpen && <input className="filter" placeholder="Filter by task title" aria-label="Filter by task title" value={filter} onChange={event => setFilter(event.target.value)} />}<div className="columns">{(["Ready", "In progress", "Done"] as const).map(status => { const matching = tasks.filter(task => task.status === status && task.title.toLowerCase().includes(filter.toLowerCase())); return <section className="column" key={status}><div className="column-head"><h3>{status}</h3><span>{matching.length}</span></div>{matching.map(task => <button className="task" key={task.id} onClick={() => setSelectedId(task.id)} aria-label={task.title}><strong>{task.title}</strong><span>{task.description}</span><small>{status}</small></button>)}{!matching.length && <p>No matching tasks here.</p>}</section>; })}</div></section>}
        {tab === "Activity" && <section className="activity"><div className="eyebrow">CHANGE LOG</div><h2>Project activity</h2>{activity.length ? <ol>{activity.map(entry => <li key={entry.id}><div className="activity-dot"/><div><strong>{entry.title}</strong>{entry.detail && <p>{entry.detail}</p>}<small>Just now · this session</small></div></li>)}</ol> : <p className="empty">No changes in this session yet. Create or update a task to see its history here.</p>}</section>}
      </main>}
    </div>
    {creating && <div className="scrim" onMouseDown={event => { if (event.target === event.currentTarget) setCreating(false); }}><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-heading" onSubmit={createTask}><div className="dialog-top"><div className="eyebrow">APOLLO LAUNCH</div><button type="button" className="close" aria-label="Close dialog" onClick={() => setCreating(false)}>×</button></div><h2 id="create-heading">Create a task</h2><p>Give the next reviewer enough context to act.</p><label htmlFor="task-title">Task title</label><input id="task-title" autoFocus required placeholder="What needs to be done?" value={title} onChange={event => setTitle(event.target.value)} /><label htmlFor="task-description">Context</label><textarea id="task-description" rows={4} placeholder="Add the context a teammate needs" value={description} onChange={event => setDescription(event.target.value)} /><div className="dialog-actions"><button type="button" className="outline" onClick={() => setCreating(false)}>Cancel</button><button className="solid" type="submit">Create task</button></div></form></div>}
    {selected && <div className="drawer-layer" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="drawer" aria-label="Task details"><div className="dialog-top"><div className="eyebrow">TASK DETAILS</div><button className="close" aria-label="Close task" onClick={() => setSelectedId(null)}>×</button></div><h2>{selected.title}</h2><p>{selected.description}</p><div className="detail-line"><span>Status</span><span className={`status ${selected.status === "In progress" ? "working" : ""}`}>{selected.status}</span></div>{selected.status === "Ready" && <button className="solid start" onClick={startWork}>Start work</button>}<section className="notes"><h3>Notes</h3>{(notes[selected.id] ?? []).length ? (notes[selected.id] ?? []).map((text, index) => <div className="note" key={index}>{text}</div>) : <p>No notes yet. Add the first update.</p>}<form onSubmit={postNote}><textarea aria-label="Write a progress note" rows={3} placeholder="Write a progress note" value={note} onChange={event => setNote(event.target.value)} /><button className="outline">Post note</button></form></section></aside></div>}
    <DemoRunner demos={demos} enabled={import.meta.env.DEV} paceMs={800} />
  </div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);

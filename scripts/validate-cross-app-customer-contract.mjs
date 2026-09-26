import fs from "node:fs";
const contract = JSON.parse(fs.readFileSync("contracts/customer-experience-contract-v1.json", "utf8"));
const navJs = fs.readFileSync("saas-prototype/customer-navigation-parity-v1.js", "utf8");
const customerHtml = fs.readFileSync("saas-prototype/customer.html", "utf8");
const decisionCard = fs.readFileSync("saas-prototype/decision-card-evidence-v1.js", "utf8");
const customerShell = fs.readFileSync("saas-prototype/customer-only-shell-v1.js", "utf8");
const appJs = fs.readFileSync("saas-prototype/app.js", "utf8");
if (!contract.contractVersion || !navJs || !customerHtml || !decisionCard || !customerShell || !appJs) process.exit(1);
console.log("TEMP PARITY LOAD PASS", contract.contractVersion);

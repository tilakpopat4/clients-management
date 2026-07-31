import { Client, Invoice, WorkItem } from '../types';

export function exportClientCSV(client: Client, clientWorkItems: WorkItem[], clientInvoices: Invoice[]) {
  const escapeCsv = (val: string | number | boolean | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows: string[] = [];

  // 1. Title & Date
  rows.push(["CLIENT WORK HISTORY & INVOICE SUMMARY REPORT"].map(escapeCsv).join(","));
  rows.push([`Generated On: ${new Date().toLocaleString('en-IN')}`].map(escapeCsv).join(","));
  rows.push("");

  // 2. Client Overview Header
  rows.push(["CLIENT OVERVIEW"].map(escapeCsv).join(","));
  rows.push(["Client ID", "Client Name", "Phone", "Email", "Default Reel Rate (₹)", "Last Payment Date"].map(escapeCsv).join(","));
  rows.push([
    client.id,
    client.name,
    client.phone,
    client.email || "N/A",
    client.defaultRate,
    client.lastPaymentDate ? new Date(client.lastPaymentDate).toLocaleDateString('en-IN') : "Not Set"
  ].map(escapeCsv).join(","));

  rows.push("");

  // 3. Financial Summary
  const totalWorkItems = clientWorkItems.length;
  const totalWorkAmount = clientWorkItems.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  const totalInvoiced = clientInvoices.reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0);
  const paidInvoiced = clientInvoices.filter(i => i.status === 'Paid').reduce((acc, inv) => acc + (Number(inv.totalAmount) || 0), 0);
  const pendingInvoiced = totalInvoiced - paidInvoiced;

  rows.push(["FINANCIAL SUMMARY"].map(escapeCsv).join(","));
  rows.push(["Total Work Logs", "Total Work Value (₹)", "Total Invoices", "Total Invoiced (₹)", "Paid Amount (₹)", "Pending Balance (₹)"].map(escapeCsv).join(","));
  rows.push([
    totalWorkItems,
    totalWorkAmount,
    clientInvoices.length,
    totalInvoiced,
    paidInvoiced,
    pendingInvoiced
  ].map(escapeCsv).join(","));

  rows.push("");

  // 4. Work History Logs
  rows.push(["WORK HISTORY LOGS"].map(escapeCsv).join(","));
  rows.push(["Log ID", "Date", "Sub-Client", "Description", "Quantity", "Rate (₹)", "Total Amount (₹)", "Invoiced Status", "Video Link"].map(escapeCsv).join(","));
  
  if (clientWorkItems.length === 0) {
    rows.push(["No work logs recorded for this client."].map(escapeCsv).join(","));
  } else {
    const sortedWork = [...clientWorkItems].sort((a, b) => b.date - a.date);
    sortedWork.forEach(item => {
      const isInvoiced = item.status === 'Invoiced' || !!item.invoiceId;
      rows.push([
        item.id,
        new Date(item.date).toLocaleDateString('en-IN'),
        item.subClientName || "General / Direct Client",
        item.description,
        item.quantity,
        item.rate,
        item.quantity * item.rate,
        isInvoiced ? "Invoiced" : "Uninvoiced",
        item.videoUrl || ""
      ].map(escapeCsv).join(","));
    });
  }

  rows.push("");

  // 5. Invoices Summary
  rows.push(["INVOICES SUMMARY"].map(escapeCsv).join(","));
  rows.push(["Invoice ID", "Date", "Status", "Items/Reels Count", "Total Amount (₹)"].map(escapeCsv).join(","));
  
  if (clientInvoices.length === 0) {
    rows.push(["No invoices generated for this client."].map(escapeCsv).join(","));
  } else {
    const sortedInvoices = [...clientInvoices].sort((a, b) => (b.date || 0) - (a.date || 0));
    sortedInvoices.forEach(inv => {
      rows.push([
        inv.id,
        inv.date ? new Date(inv.date).toLocaleDateString('en-IN') : 'N/A',
        inv.status,
        inv.reels ? inv.reels.length : 0,
        inv.totalAmount
      ].map(escapeCsv).join(","));
    });
  }

  const csvString = rows.join("\n");
  const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const sanitizedName = client.name.replace(/[^a-zA-Z0-9_\-]/g, "_");
  link.setAttribute("href", url);
  link.setAttribute("download", `${sanitizedName}_Work_History_Invoice_Summary.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

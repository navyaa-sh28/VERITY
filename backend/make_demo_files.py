import os
import pymupdf
import docx

os.makedirs("demo_files", exist_ok=True)


def make_pdf(path, pages):
    doc = pymupdf.open()
    for title, body in pages:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(60, 60, 535, 110), title, fontsize=20, fontname="helv")
        page.insert_textbox(pymupdf.Rect(60, 130, 535, 700), body, fontsize=14, fontname="helv")
    doc.save(path)
    doc.close()


make_pdf("demo_files/nimbus_campaign.pdf", [
    ("Nimbus Launch Campaign (page 1)",
     "Nimbus is the #1 cloud storage in India. Nimbus offers encrypted file storage with automatic backups."),
    ("Nimbus Launch Campaign (page 2)",
     "Nimbus guarantees 100% uptime. Trusted by 8,000 business customers."),
])
make_pdf("demo_files/nimbus_evidence_pack.pdf", [
    ("Nimbus Company Profile",
     "Nimbus is a cloud storage service for small businesses. Nimbus offers encrypted file storage with automatic backups."),
    ("Nimbus Market Position Report 2025",
     "In the 2025 Cloud Storage Market Report, Nimbus ranked third among cloud storage providers for small businesses in India. Nimbus is not the market leader."),
    ("Nimbus Reliability and SLA Policy",
     "Nimbus targets 99.9% monthly uptime. Nimbus does not guarantee uninterrupted service."),
])
make_pdf("demo_files/nimbus_security_policy.pdf", [
    ("Nimbus Data Residency Policy",
     "Nimbus stores customer data in data centres in Mumbai and Hyderabad."),
    ("Nimbus Encryption Policy",
     "Nimbus encrypts files at rest with AES-256 and in transit with TLS 1.3."),
])
d = docx.Document()
d.add_heading("Nimbus Launch Campaign", level=1)
d.add_paragraph("Nimbus is the #1 cloud storage in India. Nimbus offers encrypted file storage with automatic backups.")
d.add_paragraph("Nimbus guarantees 100% uptime. Trusted by 8,000 business customers.")
d.save("demo_files/nimbus_campaign.docx")
print("Created demo_files/: nimbus_campaign.pdf, nimbus_evidence_pack.pdf, nimbus_security_policy.pdf, nimbus_campaign.docx")

import json
import smtplib
import sys
import os
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from email.header import Header

def send_mail(file_path):
    config_path = os.path.join(os.path.dirname(__file__), '../auth.json')
    with open(config_path, 'r') as f:
        config = json.load(f)

    sender_email = config['email']
    auth_code = config['auth_code']
    smtp_server = config.get('smtp_server', 'smtp.163.com')
    smtp_port = config.get('smtp_port', 465)
    receiver_email = config['send_kindle_emali']

    if not os.path.exists(file_path):
        print(f'Error: File {file_path} not found.')
        return False

    msg = MIMEMultipart()
    msg['From'] = sender_email
    msg['To'] = receiver_email
    msg['Subject'] = ''

    filename = os.path.basename(file_path)
    # 核心修复：移除空格，并使用 Header 包装文件名以支持中文
    part = MIMEBase('application', 'octet-stream')
    part.set_payload(attachment_read(file_path))
    encoders.encode_base64(part)
    
    # 采用标准 RFC 2231 格式确保 Kindle 兼容性
    part.add_header('Content-Disposition', 'attachment', filename=('utf-8', '', filename))
    msg.attach(part)

    try:
        with smtplib.SMTP_SSL(smtp_server, smtp_port) as server:
            server.login(sender_email, auth_code)
            server.send_message(msg)
        print('SUCCESS: Email sent to Kindle with proper filename.')
        return True
    except Exception as e:
        print(f'Error: {e}')
        return False

def attachment_read(path):
    with open(path, 'rb') as f:
        return f.read()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 send_kindle.py <file_path>')
    else:
        send_mail(sys.argv[1])

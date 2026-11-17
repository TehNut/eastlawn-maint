#!/usr/bin/env bash
# Harden a fresh Ubuntu 26.04 VPS and install Docker.
# Usage (as root): bash vps-setup.sh <username>
# Expects <username> to exist with your SSH key already in ~/.ssh/authorized_keys.
# Keep your current SSH session open until you've confirmed a new login works.
set -euo pipefail

USERNAME="${1:?usage: $0 <username>}"

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
id "$USERNAME" &>/dev/null || { echo "user $USERNAME does not exist" >&2; exit 1; }
# Password login gets disabled below; refuse to lock you out.
[[ -s "/home/$USERNAME/.ssh/authorized_keys" ]] || { echo "no SSH key in /home/$USERNAME/.ssh/authorized_keys" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating packages"
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl ufw fail2ban unattended-upgrades

echo "==> Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "==> Admin user $USERNAME"
usermod -aG sudo "$USERNAME"

echo "==> SSH hardening"
# 00- prefix: sshd uses the first value it sees, so this beats cloud-init's 50- drop-in.
cat > /etc/ssh/sshd_config.d/00-hardening.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowUsers $USERNAME
EOF
sshd -t
systemctl restart ssh

echo "==> Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw limit OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "==> Kernel network hardening"
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
EOF
sysctl --system >/dev/null

echo "==> Docker"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shortcut: assumes Docker publishes a repo for this release's codename; if apt 404s, set Suites to the previous LTS (noble).
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "$VERSION_CODENAME")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Docker-published ports bypass ufw, so bind them to localhost by default;
# expose apps through a reverse proxy on 80/443 (or publish "0.0.0.0:PORT:PORT" explicitly).
install -d /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "ip": "127.0.0.1",
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "no-new-privileges": true
}
EOF
systemctl enable docker
systemctl restart docker
# docker group is root-equivalent; drop this line if you'd rather use sudo docker.
usermod -aG docker "$USERNAME"

docker run --rm hello-world >/dev/null && echo "==> Docker OK"
echo "Done. From a NEW terminal, test: ssh $USERNAME@<server-ip>  (root and password login are now disabled)"

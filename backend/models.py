from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
import datetime

class Site(Base):
    __tablename__ = "sites"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    url = Column(String)
    icon = Column(String)
    status = Column(String, default="pending")
    latency = Column(Float, nullable=True)
    external_status = Column(String, nullable=True)
    last_checked = Column(DateTime, nullable=True)
    outage_count = Column(Integer, default=0)  # external downtime count
    alert_active = Column(Integer, default=0)
    last_alert_at = Column(DateTime, nullable=True)
    history = relationship("History", back_populates="site", cascade="all, delete-orphan")

class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String)
    latency = Column(Float, nullable=True)
    site = relationship("Site", back_populates="history")

class SystemHistory(Base):
    __tablename__ = "system_history"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    cpu = Column(Float)
    ram = Column(Float)
    disk = Column(Float)
    gpu = Column(Float, nullable=True)
    network_online = Column(Integer, default=1)  # 1=online, 0=offline
    cpu_pressure = Column(Float, nullable=True)
    network_received = Column(Integer, nullable=True)
    network_sent = Column(Integer, nullable=True)

class OutageEvent(Base):
    __tablename__ = "outage_events"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    outage_type = Column(String)  # 'network' | 'power'
    started_at = Column(DateTime)
    ended_at = Column(DateTime, nullable=True)  # null = ongoing

class Settings(Base):
    __tablename__ = "settings"
    id = Column(Integer, primary_key=True, index=True)
    dashboard_name = Column(String, default="Odyssey")
    logo_url = Column(String, nullable=True)
    email_enabled = Column(Integer, default=0)
    email_provider = Column(String, default="gmail")
    email_smtp_server = Column(String, nullable=True)
    email_smtp_port = Column(Integer, default=587)
    email_username = Column(String, nullable=True)
    email_password = Column(String, nullable=True)
    email_recipient = Column(String, nullable=True)
    ntfy_enabled = Column(Integer, default=0)
    ntfy_url = Column(String, default="https://ntfy.sh")
    ntfy_topic = Column(String, nullable=True)
    ntfy_token = Column(String, nullable=True)
    host_outage_title = Column(String, default="Host Network Outage")
    host_outage_body = Column(String, default="The host server network connection is OFFLINE.")
    host_recovery_title = Column(String, default="Host Network Restored")
    host_recovery_body = Column(String, default="System was offline but is back up.\nServer lost connection on: {offline_at} & re-connected at: {online_at}")
    site_outage_title = Column(String, default="Site Offline: {site_name}")
    site_outage_body = Column(String, default="The site {site_name} ({site_url}) failed subsequent checks and is OFFLINE.")
    site_recovery_title = Column(String, default="Site Recovered: {site_name}")
    site_recovery_body = Column(String, default="The site {site_name} ({site_url}) passed subsequent checks and is back ONLINE. Current status: {status}.")
    test_title = Column(String, default="Test Alert")
    test_body = Column(String, default="This is a test alert notification from your Suros dashboard.")
    polling_rate = Column(Float, default=30.0)
    smart_schedule = Column(String, default="daily")
    smart_time = Column(String, default="03:00")

class DriveAlias(Base):
    __tablename__ = "drive_aliases"
    device = Column(String, primary_key=True, index=True)
    alias = Column(String)

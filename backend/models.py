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
    last_checked = Column(DateTime, nullable=True)
    history = relationship("History", back_populates="site", cascade="all, delete-orphan")

class History(Base):
    __tablename__ = "history"
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"))
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String)
    latency = Column(Float, nullable=True)
    site = relationship("Site", back_populates="history")

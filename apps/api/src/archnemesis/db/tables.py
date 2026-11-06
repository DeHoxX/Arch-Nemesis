"""Database table models for SQLAlchemy ORM."""

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class IntakeSessionTable(Base):
    """Database record for an intake dialogue session."""

    __tablename__ = "intake_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="collecting")
    rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    turns_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    brief_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(30), nullable=False)


class DesignTable(Base):
    """Database record for an architecture design."""

    __tablename__ = "designs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    intake_session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("intake_sessions.id"), unique=True, nullable=False
    )
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)

    versions: Mapped[list["DesignVersionTable"]] = relationship(
        back_populates="design",
        cascade="all, delete-orphan",
        order_by="DesignVersionTable.version_no",
    )


class DesignVersionTable(Base):
    """Immutable version record for an architecture design."""

    __tablename__ = "design_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    design_id: Mapped[str] = mapped_column(String(36), ForeignKey("designs.id"), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    brief_json: Mapped[str] = mapped_column(Text, nullable=False)
    spec_json: Mapped[str] = mapped_column(Text, nullable=False)
    explanation_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(50), nullable=False)
    models_json: Mapped[str] = mapped_column(Text, nullable=False)
    warnings_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)

    design: Mapped["DesignTable"] = relationship(back_populates="versions")

    __table_args__ = (
        UniqueConstraint("design_id", "version_no", name="uq_design_versions_design_id_version_no"),
    )


class LeadTable(Base):
    """Database record for a captured prospective client lead."""

    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    design_id: Mapped[str] = mapped_column(String(36), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    consent_text_version: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["design_id", "version_no"],
            ["design_versions.design_id", "design_versions.version_no"],
            name="fk_leads_design_versions",
        ),
    )


class ChatMessageTable(Base):
    """Database record for refinement chat messages."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    design_id: Mapped[str] = mapped_column(String(36), ForeignKey("designs.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)


class PatchTable(Base):
    """Database record for candidate graph patches."""

    __tablename__ = "patches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    design_id: Mapped[str] = mapped_column(String(36), ForeignKey("designs.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    base_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    patch_json: Mapped[str] = mapped_column(Text, nullable=False)
    diff_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    issues_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)
    decided_at: Mapped[str | None] = mapped_column(String(30), nullable=True)


class SpecCacheTable(Base):
    """Database record for cached architecture specifications."""

    __tablename__ = "spec_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    spec_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String(30), nullable=False)

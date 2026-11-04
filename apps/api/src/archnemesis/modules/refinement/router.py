"""FastAPI router for architecture refinement chat, suggestions, and versioning."""

from fastapi import APIRouter

from archnemesis.dependencies import LLM, DBSession
from archnemesis.modules.refinement import service
from archnemesis.modules.refinement.schemas import (
    AcceptPatchRequest,
    ChatRequest,
    ChatResponse,
    MessagesResponse,
    RefinedDesignResponse,
    RejectPatchResponse,
    RestoreRequest,
    SuggestionsResponse,
    VersionsResponse,
)

router = APIRouter(prefix="/api/designs", tags=["refinement"])


@router.post("/{id}/chat", response_model=ChatResponse)
async def post_chat(
    id: str,
    request: ChatRequest,
    db: DBSession,
    llm: LLM,
) -> ChatResponse:
    """Submit a conversational refinement request."""
    return await service.handle_chat(db=db, design_id=id, request=request, llm=llm)


@router.post("/{id}/suggestions", response_model=SuggestionsResponse)
async def post_suggestions(
    id: str,
    db: DBSession,
    llm: LLM,
) -> SuggestionsResponse:
    """Generate structural architectural improvement suggestions."""
    return await service.handle_suggestions(db=db, design_id=id, llm=llm)


@router.post("/{id}/patches/{pid}/accept", response_model=RefinedDesignResponse)
async def post_accept_patch(
    id: str,
    pid: str,
    request: AcceptPatchRequest,
    db: DBSession,
) -> RefinedDesignResponse:
    """Accept and apply a candidate patch to promote a new design version."""
    return await service.accept_patch(db=db, design_id=id, patch_id=pid, request=request)


@router.post("/{id}/patches/{pid}/reject", response_model=RejectPatchResponse)
async def post_reject_patch(
    id: str,
    pid: str,
    db: DBSession,
) -> RejectPatchResponse:
    """Reject a candidate patch."""
    return await service.reject_patch(db=db, design_id=id, patch_id=pid)


@router.post("/{id}/restore", response_model=RefinedDesignResponse)
async def post_restore_version(
    id: str,
    request: RestoreRequest,
    db: DBSession,
) -> RefinedDesignResponse:
    """Restore a historical version as a new latest version."""
    return await service.restore_version(db=db, design_id=id, request=request)


@router.get("/{id}/messages", response_model=MessagesResponse)
async def get_design_messages(
    id: str,
    db: DBSession,
) -> MessagesResponse:
    """Retrieve full chat history for a design."""
    return await service.get_messages(db=db, design_id=id)


@router.get("/{id}/versions", response_model=VersionsResponse)
async def get_design_versions(
    id: str,
    db: DBSession,
) -> VersionsResponse:
    """Retrieve all versions of a design, newest first."""
    return await service.get_versions_list(db=db, design_id=id)


@router.get("/{id}/versions/{n}", response_model=RefinedDesignResponse)
async def get_design_version_by_number(
    id: str,
    n: int,
    db: DBSession,
) -> RefinedDesignResponse:
    """Retrieve a specific historical design version."""
    return await service.get_version_detail(db=db, design_id=id, version_no=n)

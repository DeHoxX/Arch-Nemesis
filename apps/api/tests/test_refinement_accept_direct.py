"""Direct test for refinement accept_patch service to expose unhandled exceptions."""

import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from archnemesis.db.tables import DesignTable, DesignVersionTable, IntakeSessionTable
from archnemesis.modules.refinement import repo as refinement_repo
from archnemesis.modules.refinement import service as refinement_service
from archnemesis.modules.refinement.schemas import AcceptPatchRequest
from archnemesis.modules.validation.patch import Changes, Op, Patch
from archnemesis.shared.brief import BriefConstraint, RequirementBrief

BASE_SPEC_DICT = {
    "nodes": [
        {
            "id": "node_in",
            "name": "Ingress Gateway",
            "type": "gateway",
            "role": "Receives external requests",
            "inputs": [],
            "outputs": ["raw_req"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "node_auth",
            "name": "Auth Service",
            "type": "auth",
            "role": "Authenticates and authorizes requests",
            "inputs": ["raw_req"],
            "outputs": ["auth_req"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "node_proc",
            "name": "Core Processor",
            "type": "processor",
            "role": "Processes valid requests",
            "inputs": ["auth_req"],
            "outputs": ["result"],
            "tech_options": [],
            "needs_model": False,
        },
        {
            "id": "node_out",
            "name": "Egress Sink",
            "type": "sink",
            "role": "Delivers output to user",
            "inputs": ["result"],
            "outputs": [],
            "tech_options": [],
            "needs_model": False,
        },
    ],
    "edges": [
        {"from": "node_in", "to": "node_auth", "flows": "req"},
        {"from": "node_auth", "to": "node_proc", "flows": "auth_token"},
        {"from": "node_proc", "to": "node_out", "flows": "res"},
    ],
    "constraints": [
        {
            "id": "c_auth_pass",
            "text": "All traffic must pass through auth",
            "kind": "must_pass_through",
            "node_id": "node_auth",
            "covers": ["bc1"],
        },
        {
            "id": "c_proc_exist",
            "text": "Core processor must exist",
            "kind": "must_exist",
            "node_id": "node_proc",
            "covers": ["bc2"],
        },
    ],
    "entry_ids": ["node_in"],
    "exit_ids": ["node_out"],
}

BASE_BRIEF = RequirementBrief(
    summary="Core enterprise processing pipeline.",
    users="Enterprise clients",
    data_involved=["Requests", "Tokens"],
    domain_hint="Enterprise",
    stated_constraints=[
        BriefConstraint(id="bc1", text="Authentication required for every request"),
        BriefConstraint(id="bc2", text="Processor service must exist"),
    ],
    unverifiable_requirements=["System must feel ultra fast"],
    numbers_given=[],
    assumptions=[],
)


@pytest.mark.asyncio
async def test_direct_accept_patch_execution(
    temp_db_session_factory: async_sessionmaker[AsyncSession],
) -> None:
    """Directly execute accept_patch service without HTTP wrapping to surface server-side traceback."""
    design_id = "des-direct-1"
    patch_id = "patch-direct-1"

    valid_patch = Patch(
        ops=[
            Op(
                op="edit_node",
                node_id="node_auth",
                changes=Changes(name="OAuth2 Auth Service"),
            )
        ]
    )

    async with temp_db_session_factory() as session:
        # Seed intake session
        intake_row = IntakeSessionTable(
            id=f"sess-{design_id}",
            status="ready",
            rounds=1,
            turns_json="[]",
            brief_json=BASE_BRIEF.model_dump_json(),
            created_at="2026-11-04T00:00:00Z",
            updated_at="2026-11-04T00:00:00Z",
        )
        session.add(intake_row)
        await session.commit()

        # Seed design and version 1
        design_row = DesignTable(
            id=design_id,
            intake_session_id=intake_row.id,
            current_version=1,
            created_at="2026-11-04T00:00:00Z",
        )
        version_row = DesignVersionTable(
            id=f"ver-{design_id}-1",
            design_id=design_id,
            version_no=1,
            brief_json=BASE_BRIEF.model_dump_json(),
            spec_json=json.dumps(BASE_SPEC_DICT),
            explanation_json=None,
            prompt_version="architect_v8",
            models_json=json.dumps({"architect": "test-model"}),
            warnings_json="[]",
            change_note=None,
            created_at="2026-11-04T00:00:00Z",
        )
        session.add(design_row)
        session.add(version_row)

        # Seed candidate patch
        await refinement_repo.create_patch(
            db=session,
            patch_id=patch_id,
            design_id=design_id,
            kind="change",
            base_version=1,
            status="proposed",
            patch_json=valid_patch.model_dump_json(),
            diff_json=None,
            issues_json="[]",
            reason=None,
            created_at="2026-11-04T00:00:00Z",
        )
        await session.commit()

        # Invoke accept_patch service directly
        req = AcceptPatchRequest(confirm_drop=False)
        result = await refinement_service.accept_patch(
            db=session,
            design_id=design_id,
            patch_id=patch_id,
            request=req,
        )

        assert result.current_version == 2
        assert "OAuth2 Auth Service" in json.dumps(result.spec.model_dump())

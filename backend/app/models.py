"""Pydantic models that describe the indigoQ workspace graph."""

from __future__ import annotations

import base64
import binascii
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PortSide = Literal["top", "right", "bottom", "left"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Port(ApiModel):
    """A connection point expressed as a normalized position along one border side."""

    side: PortSide
    t: float = Field(ge=0.0, le=1.0)


class ContentEntry(ApiModel):
    """A piece of content dropped into a content-source workspace."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(min_length=1, max_length=120)
    size: int = Field(ge=0, le=100_000_000)
    dataUrl: str = Field(min_length=1)


class Workspace(ApiModel):
    """An isolated unit on the infinite canvas."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(min_length=1, max_length=80)
    x: float = Field(ge=-10_000_000, le=10_000_000)
    y: float = Field(ge=-10_000_000, le=10_000_000)
    width: float = Field(ge=80, le=20_000)
    height: float = Field(ge=60, le=20_000)
    type: str | None = Field(default=None, max_length=80)
    contents: list[ContentEntry] = Field(default_factory=list, max_length=1000)


class Wire(ApiModel):
    """A directed dataflow connection between two workspaces."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    source: str = Field(min_length=1, max_length=64)
    sourcePort: Port
    target: str = Field(min_length=1, max_length=64)
    targetPort: Port


class Graph(ApiModel):
    """The complete canvas graph."""

    workspaces: list[Workspace] = Field(default_factory=list, max_length=500)
    wires: list[Wire] = Field(default_factory=list, max_length=2_000)

    @model_validator(mode="after")
    def _validate_references(self) -> Graph:
        workspace_ids = [workspace.id for workspace in self.workspaces]
        if len(workspace_ids) != len(set(workspace_ids)):
            raise ValueError("workspace ids must be unique")

        known = set(workspace_ids)
        wire_ids: set[str] = set()
        for wire in self.wires:
            if wire.id in wire_ids:
                raise ValueError(f"duplicate wire id: {wire.id}")
            wire_ids.add(wire.id)
            if wire.source not in known:
                raise ValueError(f"wire {wire.id} references unknown source {wire.source}")
            if wire.target not in known:
                raise ValueError(f"wire {wire.id} references unknown target {wire.target}")
            if wire.source == wire.target:
                raise ValueError(f"wire {wire.id} cannot connect a workspace to itself")
        return self


class GraphSnapshot(Graph):
    """A graph plus the time it was last persisted."""

    updatedAt: str | None = None

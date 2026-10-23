---
name: Ready issue
about: A grilled idea with written acceptance criteria, ready to build
title: ''
labels: ''
assignees: ''
---

## Problem

What is wrong or missing today, in plain language.

## What to build

The smallest change that solves the problem.

## Acceptance criteria

Numbered, checkable statements that say when this is done.

1.
2.

## Proof plan

Local: the commands and checks that prove each criterion.
Hosted: which criteria need staging (a browser or a real sign-in), or none.
Schema: does this add a file to `d1/migrations`? If yes, name it. Staging and
PR previews apply it to an isolated synthetic database, and `migration-check`
applies it to a fresh local D1 database.

## Grill notes

The open questions you asked and the answers you settled. An issue with an
unresolved branch is unfinished; grill it before you build.

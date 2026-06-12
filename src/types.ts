/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SavedProject {
  id: string;
  title: string;
  inputText: string;
  latexCode: string;
  mode: "ai" | "local";
  updatedAt: number;
}

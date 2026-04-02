import { Obligation } from "./obligation";

export interface TodayFeedItem {
  obligation: Obligation;
  whyItMatters: string;
  whatToDo: string;
  howHardIsIt: string;
  primaryAction: string;
  secondaryActions: string[];
}

export interface TodayFeedResponse {
  items: TodayFeedItem[];
  generatedAt: string;
}

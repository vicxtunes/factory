-- Practice ads (owner, 2026-11-28: "want to try out marketing first, then we'll
-- be sure"): while Aming's ad account isn't connected, a business makes ads that
-- go nowhere and cost nothing, with real links to its page so its leads count
-- as the ad's. They end on their last day; nothing is charged or refunded.
alter table studio_ads add column practice boolean not null default false;

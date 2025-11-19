import { supabase } from "$lib/supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface CollaborationEditor {
	id: number;
	problem_id: number;
	user_id: string;
	field_name: string;
	cursor_position: number;
	selection_start: number | null;
	selection_end: number | null;
	last_seen: string;
	users?: {
		full_name: string | null;
		initials: string | null;
		email: string | null;
	};
}

export interface FieldUpdate {
	field_name: string;
	content: string;
	user_id: string;
	timestamp: string;
}

/**
 * Subscribe to collaboration updates for a problem
 */
export function subscribeToCollaboration(
	problemId: number,
	callbacks: {
		onEditorUpdate?: (editors: CollaborationEditor[]) => void;
		onFieldUpdate?: (update: FieldUpdate) => void;
	}
): RealtimeChannel {
	const channel = supabase
		.channel(`problem:${problemId}`)
		.on(
			"postgres_changes",
			{
				event: "*",
				schema: "public",
				table: "problem_collaboration",
				filter: `problem_id=eq.${problemId}`,
			},
			async () => {
				// Fetch updated editors when collaboration data changes
				const editors = await fetchActiveEditors(problemId);
				callbacks.onEditorUpdate?.(editors);
			}
		)
		.subscribe();

	return channel;
}

/**
 * Fetch all active editors for a problem
 */
export async function fetchActiveEditors(
	problemId: number
): Promise<CollaborationEditor[]> {
	// First, get the collaboration data
	const { data: collaborationData, error: collabError } = await supabase
		.from("problem_collaboration")
		.select("*")
		.eq("problem_id", problemId)
		.gt("last_seen", new Date(Date.now() - 30000).toISOString()) // Only active in last 30 seconds
		.order("last_seen", { ascending: false });

	if (collabError) {
		console.error("Error fetching collaboration data:", collabError);
		return [];
	}

	if (!collaborationData || collaborationData.length === 0) {
		return [];
	}

	// Get unique user IDs
	const userIds = [...new Set(collaborationData.map(c => c.user_id))];
	
	// Fetch user data for all users
	const { data: usersData, error: usersError } = await supabase
		.from("users")
		.select("id, full_name, initials, email")
		.in("id", userIds);

	if (usersError) {
		console.error("Error fetching user data:", usersError);
		// Return editors without user data
		return collaborationData.map(editor => ({
			...editor,
			users: null,
		})) as CollaborationEditor[];
	}

	// Create a map of user data
	const usersMap = new Map(
		(usersData || []).map(user => [user.id, user])
	);

	// Combine collaboration data with user data and reduce to one entry per user (latest)
	const editorsWithUsersMap = collaborationData
		.map(editor => ({
			...editor,
			users: usersMap.get(editor.user_id) || null,
		}))
		.reduce((acc, editor) => {
			const existing = acc.get(editor.user_id);
			if (!existing) {
				acc.set(editor.user_id, editor);
			} else {
				// Keep the most recent entry based on last_seen
				if (new Date(editor.last_seen).getTime() > new Date(existing.last_seen).getTime()) {
					acc.set(editor.user_id, editor);
				}
			}
			return acc;
		}, new Map<string, CollaborationEditor>());

	return Array.from(editorsWithUsersMap.values());
}

/**
 * Update or insert collaboration data for a user
 */
export async function updateCollaborationData(
	problemId: number,
	userId: string,
	fieldName: string,
	cursorPosition: number,
	selectionStart: number | null = null,
	selectionEnd: number | null = null
): Promise<void> {
	const { error } = await supabase.from("problem_collaboration").upsert(
		{
			problem_id: problemId,
			user_id: userId,
			field_name: fieldName,
			cursor_position: cursorPosition,
			selection_start: selectionStart,
			selection_end: selectionEnd,
			last_seen: new Date().toISOString(),
		},
		{
		onConflict: "problem_id,user_id,field_name",
	}
	);

	if (error) {
		console.error("Error updating collaboration data:", error);
	}
}

/**
 * Remove collaboration data when user leaves
 */
export async function removeCollaborationData(
	problemId: number,
	userId: string
): Promise<void> {
	const { error } = await supabase
		.from("problem_collaboration")
		.delete()
		.eq("problem_id", problemId)
		.eq("user_id", userId);

	if (error) {
		console.error("Error removing collaboration data:", error);
	}
}

/**
 * Remove collaboration entries for other fields when switching focus
 */
export async function removeOtherFieldEntries(
	problemId: number,
	userId: string,
	fieldName: string
): Promise<void> {
	const { error } = await supabase
		.from("problem_collaboration")
		.delete()
		.eq("problem_id", problemId)
		.eq("user_id", userId)
		.neq("field_name", fieldName);

	if (error) {
		console.error("Error removing other field entries:", error);
	}
}

// Store channels to reuse them
const broadcastChannels = new Map<number, RealtimeChannel>();

/**
 * Remove a channel from the cache and unsubscribe
 */
export function removeBroadcastChannel(problemId: number): void {
	const channel = broadcastChannels.get(problemId);
	if (channel) {
		supabase.removeChannel(channel);
		broadcastChannels.delete(problemId);
	}
}

/**
 * Broadcast field update via Supabase Realtime
 */
export async function broadcastFieldUpdate(
	problemId: number,
	fieldName: string,
	content: string,
	userId: string
): Promise<void> {
	try {
		// Get or create channel for this problem
		let channel = broadcastChannels.get(problemId);
		
		// Check channel state - use string comparison as channel.state is an enum
		const channelState = channel?.state as string;
		if (!channel || channelState === "closed" || channelState === "errored") {
			// Remove old channel if it exists and is closed
			if (channel) {
				supabase.removeChannel(channel);
				broadcastChannels.delete(problemId);
			}
			
			// Create new channel
			channel = supabase.channel(`problem:${problemId}:updates`);
			await channel.subscribe();
			broadcastChannels.set(problemId, channel);
			
			// Wait a bit for subscription to be ready
			await new Promise(resolve => setTimeout(resolve, 100));
		} else if (channelState !== "joined" && channelState !== "subscribed") {
			// Channel exists but not subscribed, wait for it
			await new Promise(resolve => setTimeout(resolve, 100));
		}
		
		// Send the broadcast
		const status = await channel.send({
			type: "broadcast",
			event: "field_update",
			payload: {
				field_name: fieldName,
				content: content,
				user_id: userId,
				timestamp: new Date().toISOString(),
			},
		});
		
		if (status !== "ok") {
			console.warn("Broadcast status:", status);
		}
	} catch (error) {
		console.error("Error broadcasting field update:", error);
	}
}

/**
 * Subscribe to field updates for a problem
 */
export function subscribeToFieldUpdates(
	problemId: number,
	onUpdate: (update: FieldUpdate) => void
): RealtimeChannel {
	// Check if channel exists and is already subscribed
	let channel = broadcastChannels.get(problemId);
	const channelState = channel?.state as string;
	
	if (channel && (channelState === "joined" || channelState === "subscribed" || channelState === "joining")) {
		// Channel already exists and is subscribed, just add the listener
		channel.on("broadcast", { event: "field_update" }, (payload) => {
			console.log("Received broadcast:", payload);
			if (payload.payload) {
				onUpdate(payload.payload as FieldUpdate);
			}
		});
		return channel;
	}
	
	// Remove old channel if it exists but is closed/errored
	if (channel && (channelState === "closed" || channelState === "errored")) {
		supabase.removeChannel(channel);
		broadcastChannels.delete(problemId);
		channel = null;
	}
	
	// Create new channel if needed
	if (!channel) {
		channel = supabase.channel(`problem:${problemId}:updates`);
		broadcastChannels.set(problemId, channel);
	}

	channel
		.on("broadcast", { event: "field_update" }, (payload) => {
			console.log("Received broadcast:", payload);
			if (payload.payload) {
				onUpdate(payload.payload as FieldUpdate);
			}
		})
		.subscribe((status) => {
			console.log("Field updates subscription status:", status);
		});

	return channel;
}


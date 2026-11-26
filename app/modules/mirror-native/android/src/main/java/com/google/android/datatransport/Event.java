// Empty stand-in: MediaPipe's usage logging must never leave the phone.
package com.google.android.datatransport;

public abstract class Event<T> { public static <T> Event<T> ofData(T data) { return new Event<T>() {}; } }

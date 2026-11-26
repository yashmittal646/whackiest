// Empty stand-in: MediaPipe's usage logging must never leave the phone.
package com.google.android.datatransport;

public interface Transport<T> { void send(Event<T> event); }

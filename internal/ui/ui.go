package ui

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed dist/*
var content embed.FS

func Handler() http.Handler {
	fsys, err := fs.Sub(content, "dist")
	if err != nil {
		panic(err)
	}
	return http.FileServer(http.FS(fsys))
}

func GetFS() fs.FS {
	fsys, err := fs.Sub(content, "dist")
	if err != nil {
		panic(err)
	}
	return fsys
}

func GetAssetsFS() fs.FS {
	fsys, err := fs.Sub(content, "dist/assets")
	if err != nil {
		panic(err)
	}
	return fsys
}

func GetImagesFS() fs.FS {
	fsys, err := fs.Sub(content, "dist/images")
	if err != nil {
		panic(err)
	}
	return fsys
}

func GetIndexHTML() ([]byte, error) {
	return content.ReadFile("dist/index.html")
}

func ServeSPA(c *gin.Context) {
	index, err := GetIndexHTML()
	if err != nil {
		c.String(http.StatusInternalServerError, "Error loading index.html: %v", err)
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", index)
}
